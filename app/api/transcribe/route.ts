import { lazyOpenAI } from '../../lib/openai-client';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import fs from 'fs';
import os from 'os';
import path from 'path';

const openai = lazyOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `audio-${Date.now()}.webm`);

    try {
      // Convert the file to a Buffer and write to temp file
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(tempFilePath, buffer);

      console.log('Audio file saved to:', tempFilePath);
      console.log('File size:', fs.statSync(tempFilePath).size);

      // Call OpenAI's Whisper API with the temp file
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        language: 'en',
        response_format: 'json',
      });

      // Clean up the temp file
      fs.unlinkSync(tempFilePath);

      if (!transcription.text) {
        throw new Error('No transcription text received');
      }

      return NextResponse.json({ text: transcription.text });
    } catch (error) {
      // Clean up temp file in case of error
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Error in transcribe API:', error);
    return NextResponse.json(
      {
        error: 'Failed to transcribe audio',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}