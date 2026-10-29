import { MODELS } from '../../lib/models';
import { lazyAIClient } from '../../lib/ai-client';
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import sharp from 'sharp';

const ai = lazyAIClient("vision");

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;

    if (!image) {
      console.error('No image provided in request');
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      );
    }

    // Log detailed image information
    console.log('Image received:', {
      type: image.type,
      size: image.size,
      name: image.name,
      lastModified: image.lastModified
    });

    // Convert File to Buffer
    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);

    console.log('Original image buffer size:', buffer.length);

    // Get image metadata before processing
    try {
      const metadata = await sharp(buffer).metadata();
      console.log('Original image metadata:', {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        space: metadata.space,
        channels: metadata.channels,
        depth: metadata.depth,
        density: metadata.density,
        isProgressive: metadata.isProgressive,
        hasProfile: metadata.hasProfile,
        hasAlpha: metadata.hasAlpha,
      });
    } catch (err) {
      console.error('Error reading image metadata:', err);
    }

    // Resize and compress image
    const processedImageBuffer = await sharp(buffer)
      .resize(800, 800, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: 80,
        progressive: true
      })
      .toBuffer();

    console.log('Processed image buffer size:', processedImageBuffer.length);

    // Get processed image metadata
    try {
      const processedMetadata = await sharp(processedImageBuffer).metadata();
      console.log('Processed image metadata:', {
        width: processedMetadata.width,
        height: processedMetadata.height,
        format: processedMetadata.format,
        space: processedMetadata.space,
        channels: processedMetadata.channels,
      });
    } catch (err) {
      console.error('Error reading processed image metadata:', err);
    }

    // Convert to base64
    const base64Image = processedImageBuffer.toString('base64');
    console.log('Base64 string length:', base64Image.length);
    console.log('First 100 chars of base64:', base64Image.substring(0, 100));


    // Call the configured vision model
    const response = await ai.chat.completions.create({
      model: MODELS.vision,
      messages: [
        {
          role: "system",
          content: `You are Baba Selo, a warm-hearted but delightfully snarky grandmother from Eastern Europe. You're analyzing images shared by your dear grandchildren. Your response style depends on what you see in the image:

1. If you see food, ingredients, or a dish in the image:
   CRITICAL FORMATTING RULES:
   For food images, identify the dish and provide ONLY the recipe in this exact format:

   [2-5 WORD RECIPE TITLE BASED ON THE DISH YOU IDENTIFIED]
   Ingredients
   - [ingredient 1]
   - [ingredient 2]
   Directions
   1. [step 1]
   2. [step 2]

   CORRECT EXAMPLES:
   If you see roasted pork with herbs:
   Herb-Roasted Pork Loin
   Ingredients
   - 2 pounds pork loin
   - Fresh herbs
   ...

   If you see a vegetable stew:
   Garden Vegetable Stew
   Ingredients
   - Fresh vegetables
   - Olive oil
   ...

   INCORRECT EXAMPLES (DO NOT DO THIS):
   ❌ "Oh what a lovely dish! [no greetings]
   ❌ "This reminds me of home... [no commentary before recipe]
   ❌ Starting with "Ingredients" without a title
   ❌ Using descriptions as the recipe title

2. If you see family photos, people, or social gatherings:
   - Respond warmly as a grandmother would
   - Share a related story from your village life
   - Maybe mention your own family (husband Ante, daughter Ljiljana, sons Davor and Marko, or grandchildren Ivo and Ana)
   - Add a touch of sass or wisdom

3. If you see nature, landscapes, or outdoor scenes:
   - Compare it to your village Dubravica near Omiš
   - Maybe mention your olive grove if relevant
   - Share a brief story or wisdom related to the scene
   - Add your characteristic sass

4. For any other type of image:
   - Describe what you see with your characteristic mix of love and sass
   - Relate it to life in your village when possible
   - End with a piece of grandmotherly wisdom

CRITICAL REMINDER FOR RECIPES:
- Start IMMEDIATELY with the recipe title (no greetings or descriptions)
- Title must be 2-5 descriptive words about the actual dish
- NO greetings or commentary before the recipe
- NO articles (a, an, the) in the title
- Recipe title must describe the actual dish (e.g., "Herb-Roasted Pork", "Garden Vegetable Stew")`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "What do you see in this image? Please analyze it as Baba Selo." },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],

      max_tokens: 500
    });

    console.log('OpenAI API response received');

    const analysis = response.choices[0]?.message?.content;
    if (!analysis) {
      console.error('No analysis received from OpenAI');
      throw new Error('No analysis received from OpenAI');
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Error processing image:', error);
    // Return more specific error message
    return NextResponse.json(
      {
        error: 'Failed to process image',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}