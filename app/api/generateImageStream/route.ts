import { saveFile, localFileUrl } from '../../lib/backend/files-server';
import { serverDb, serverAuth } from "../../lib/backend/admin";

// Image style options - must match generateImage route and settings page
const imageStyleOptions: Record<string, { prompt: string }> = {
    "photorealistic-recipe": {
        prompt: "Photorealistic food photograph. Natural lighting, authentic styling, realistic textures. Professional food photography—genuine and appetizing. No artificial or exaggerated elements."
    },
    "instagram-flatlay": {
        prompt: "Overhead flat-lay food photography for Instagram. Bird's-eye view, clean composition, minimal props, marble or wood surface. Soft natural light, shallow depth of field. Aesthetic, fresh, organized, highly shareable."
    },
    "bright-viral": {
        prompt: "Viral social media food photography. Bright punchy lighting, saturated colors, slight 45° angle. Steam rising if applicable. Fresh, eye-catching, thumbnail-worthy. The kind of food shot that gets saved and shared."
    },
    "dark-moody": {
        prompt: "Dark moody food photography. Deep shadows, dramatic side lighting, dark charcoal or black background. Sophisticated, atmospheric. Rich colors, fine dining editorial. Moody food blogger aesthetic."
    },
    "pinterest-cozy": {
        prompt: "Cozy Pinterest-style food photography. Warm natural light, kitchen or dining table setting. Steam rising, casual plating, linen napkin or wooden cutting board. Aspirational but approachable. Recipe blog aesthetic."
    },
    "minimalist-white": {
        prompt: "Minimalist food photography on pure white background. Clean elegant plating, soft diffused lighting, no distractions. Sophisticated—like a high-end restaurant menu or cookbook cover."
    },
    "golden-hour": {
        prompt: "Food photography in golden hour lighting. Warm sunset glow through window, soft shadows, romantic restaurant ambiance. Dish bathed in amber light. Elegant, inviting, magazine-quality."
    },
    "street-food": {
        prompt: "Authentic street food photography. Casual setting—paper plate, market stall, or food truck. Natural daylight, unpretentious plating. Real, approachable, the way food actually looks when you buy it. No fancy styling."
    },
    "vintage-retro": {
        prompt: "Vintage 1970s-80s cookbook food photography. Slightly faded warm tones, retro styling, old-fashioned plating. Nostalgic charm—like a well-loved recipe card from grandma's kitchen."
    },
    "whimsical-cartoon": {
        prompt: "IMPORTANT: This must be a 2D animated illustration, NOT a photograph. The dish is the clear focal point—large, prominent, center-frame, impossible to miss. Studio Ghibli style: painterly hand-drawn aesthetic with soft watercolor washes, gentle gouache-like layers, organic flowing lines. The dish itself rendered with care and warmth, rounded inviting shapes, rich appetizing detail. Background and setting are secondary—softly suggested, out of focus or simplified: a hint of warm wood, soft light, pastoral atmosphere. The food must dominate the composition. Hand-painted storybook quality of Spirited Away. Whimsical, nostalgic, inviting. No realism."
    }
};

function encodeSSE(data: object): string {
    return `data: ${JSON.stringify(data)}\n\n`;
}

function isControllerClosed(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes('already closed') || msg.includes('ERR_INVALID_STATE');
}

function safeEnqueue(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, data: object): boolean {
    try {
        controller.enqueue(encoder.encode(encodeSSE(data)));
        return true;
    } catch (e) {
        if (isControllerClosed(e)) return false;
        throw e;
    }
}

function safeClose(controller: ReadableStreamDefaultController<Uint8Array>): void {
    try {
        controller.close();
    } catch (e) {
        if (!isControllerClosed(e)) throw e;
    }
}

export async function POST(req: Request) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            try {
                const { prompt, userId, recipeId } = await req.json();

                if (!prompt || !recipeId) {
                    safeEnqueue(controller, encoder, { type: 'error', message: 'Missing prompt or recipeId' });
                    safeClose(controller);
                    return;
                }

                // Resolve style prompt (same logic as generateImage)
                let stylePrompt = imageStyleOptions["photorealistic-recipe"].prompt;
                let userStyle: string | null = null;
                if (userId) {
                    try {
                        const userDoc = await serverDb.collection('users').doc(userId).get();
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            userStyle = userData?.preferredImageStyle || null;
                            if (userStyle && imageStyleOptions[userStyle]) {
                                stylePrompt = imageStyleOptions[userStyle].prompt;
                            }
                        }
                    } catch (error) {
                        console.error("Error fetching user style preference:", error);
                    }
                }

                const fullPrompt = userStyle === "whimsical-cartoon"
                    ? `${stylePrompt} Depict: ${prompt}`
                    : `${prompt}. ${stylePrompt}`;

                // Call OpenAI Images API directly with fetch - the SDK's images.generate does NOT
                // pass stream:true to the client, so streaming responses are mishandled.
                const apiKey = process.env.OPENAI_API_KEY;
                if (!apiKey) {
                    safeEnqueue(controller, encoder, { type: 'error', message: 'API key not configured' });
                    safeClose(controller);
                    return;
                }

                const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'gpt-image-1',
                        prompt: fullPrompt,
                        n: 1,
                        size: '1536x1024',
                        quality: 'low',
                        stream: true,
                        partial_images: 2,
                        output_format: 'png',
                    }),
                });

                if (!openaiRes.ok || !openaiRes.body) {
                    const errText = await openaiRes.text();
                    safeEnqueue(controller, encoder, {
                        type: 'error',
                        message: openaiRes.status === 401 ? 'Invalid API key' : errText || `API error ${openaiRes.status}`
                    });
                    safeClose(controller);
                    return;
                }

                let finalB64: string | null = null;
                const reader = openaiRes.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let clientGone = false;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6).trim();
                            if (data === '[DONE]') continue;
                            try {
                                const ev = JSON.parse(data) as { type?: string; partial_image_index?: number; b64_json?: string };
                                const b64 = ev.b64_json;
                                if (!b64) continue;

                                if (ev.type === 'image_generation.partial_image') {
                                    const idx = ev.partial_image_index ?? 0;
                                    if (!safeEnqueue(controller, encoder, { type: 'partial', index: idx, b64 })) {
                                        clientGone = true;
                                        break;
                                    }
                                } else if (ev.type === 'image_generation.completed') {
                                    finalB64 = b64;
                                    if (!safeEnqueue(controller, encoder, { type: 'partial', index: 2, b64 })) {
                                        clientGone = true;
                                        break;
                                    }
                                }
                            } catch {
                                // skip malformed lines
                            }
                        }
                    }
                    if (clientGone) break;
                }

                // Handle any remaining buffer
                if (buffer.startsWith('data: ')) {
                    const data = buffer.slice(6).trim();
                    if (data !== '[DONE]') {
                        try {
                            const ev = JSON.parse(data) as { type?: string; b64_json?: string };
                            if (ev.b64_json && ev.type === 'image_generation.completed') {
                                finalB64 = ev.b64_json;
                            }
                        } catch {
                            // skip
                        }
                    }
                }

                if (clientGone) return;

                if (!finalB64) {
                    safeEnqueue(controller, encoder, {
                        type: 'error',
                        message: 'No image generated'
                    });
                    safeClose(controller);
                    return;
                }

                const imageBuffer = Buffer.from(finalB64, "base64");
                const key = `recipe-images/${recipeId}.png`;
                await saveFile(key, imageBuffer, 'image/png');
                const url = localFileUrl(key);
                safeEnqueue(controller, encoder, { type: 'final', imageUrl: url });
            } catch (error) {
                console.error('Error in generateImageStream:', error);
                safeEnqueue(controller, encoder, {
                    type: 'error',
                    message: error instanceof Error ? error.message : 'Failed to generate image'
                });
            } finally {
                safeClose(controller);
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
