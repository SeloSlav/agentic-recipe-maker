import { saveFile, localFileUrl } from '../../lib/backend/files-server';
import { NextResponse } from 'next/server';
import { serverDb, serverAuth } from "../../lib/backend/admin";
import { SpoonPointSystem } from '../../lib/spoonPoints';

// Image style options - must match settings page (platform & vibe focused)
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

export async function POST(req: Request) {
    try {
        const { prompt, userId, recipeId, styleOverride } = await req.json();
        console.log("Received request with userId:", userId, "styleOverride:", styleOverride);

        if (!prompt || !recipeId) {
            return NextResponse.json({
                error: "Missing prompt or recipeId",
                message: "Something went wrong. Please try again."
            }, { status: 400 });
        }

        // Check if user can generate an image (cooldown/limits) but don't block generation
        let canAwardPoints = false;
        if (userId) {
            const actionCheck = await SpoonPointSystem.isActionAvailable(
                userId,
                'GENERATE_IMAGE',
                recipeId
            );
            canAwardPoints = actionCheck.available;
        }

        // Get style: styleOverride (for preview generation) takes precedence, else user preference from local backend
        let stylePrompt = imageStyleOptions["photorealistic-recipe"].prompt;
        let userStyle: string | null = null;
        if (styleOverride && imageStyleOptions[styleOverride]) {
            userStyle = styleOverride;
            stylePrompt = imageStyleOptions[styleOverride].prompt;
        } else if (userId) {
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

        console.log("Final style prompt being used:", stylePrompt);

        // For whimsical-cartoon, put style first to override "rustic" in base prompt
        const fullPrompt = userStyle === "whimsical-cartoon"
            ? `${stylePrompt} Depict: ${prompt}`
            : `${prompt}. ${stylePrompt}`;

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "API key not configured", message: "Server configuration error." }, { status: 500 });
        }

        const res = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-image-1',
                prompt: fullPrompt,
                n: 1,
                size: '1536x1024',
                quality: 'low',
                output_format: 'png',
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({
                error: "API error",
                message: err || "Failed to generate image. Please try again."
            }, { status: 500 });
        }

        const data = await res.json();
        const b64 = data?.data?.[0]?.b64_json;
        if (!b64) {
            return NextResponse.json({
                error: "No image in response",
                message: "Failed to generate image. Please try again."
            }, { status: 500 });
        }

        const imageBuffer = Buffer.from(b64, 'base64');

        const key = `recipe-images/${recipeId}.png`;
        await saveFile(key, imageBuffer, 'image/png');
        const url = localFileUrl(key);
        return NextResponse.json({
            imageUrl: url,
            canAwardPoints
        });
    } catch (error) {
        console.error('Error generating image:', error);
        return NextResponse.json({
            error: "Failed to generate image",
            message: "Something went wrong while generating the image. Please try again later."
        }, { status: 500 });
    }
}