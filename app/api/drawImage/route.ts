import { saveFile, localFileUrl } from '../../lib/backend/files-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { prompt, userId, recipeId } = await req.json();
        console.log("Received request with userId:", userId);

        if (!prompt || !recipeId) {
            return NextResponse.json({ error: "Missing prompt or recipeId" }, { status: 400 });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

        const res = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-image-1',
                prompt,
                n: 1,
                size: '1536x1024',
                quality: 'low',
                output_format: 'png',
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(err || `API error ${res.status}`);
        }

        const data = await res.json();
        const b64 = data?.data?.[0]?.b64_json;
        if (!b64) throw new Error("No image in response");

        const imageBuffer = Buffer.from(b64, 'base64');

        const key = `recipe-images/${recipeId}.png`;
        await saveFile(key, imageBuffer, 'image/png');
        const url = localFileUrl(key);
        return NextResponse.json({ imageUrl: url });
    } catch (error) {
        console.error('Error generating image:', error);
        return NextResponse.json(
            { error: "Failed to generate image" },
            { status: 500 }
        );
    }
}