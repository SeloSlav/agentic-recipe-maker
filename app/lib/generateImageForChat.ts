import { saveFile, localFileUrl } from './backend/files-server';

/**
 * Generate an image for chat (food, dish, etc.) and upload to local backend.
 * Uses gpt-image-1 with quality low (same as recipe page).
 */
export async function generateImageForChat(prompt: string, userId = 'anonymous'): Promise<{ imageUrl: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

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
  if (!b64) throw new Error('No image in response');

  const imageBuffer = Buffer.from(b64, 'base64');

  const storageId = `chat-${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const key = `recipe-images/${storageId}`;
  await saveFile(key, imageBuffer, 'image/png');
  const url = localFileUrl(key);
  return { imageUrl: url };
}
