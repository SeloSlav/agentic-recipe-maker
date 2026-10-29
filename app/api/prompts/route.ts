import { NextResponse } from 'next/server';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  QueryConstraint
} from '../../lib/backend/database';
import { db } from "../../lib/backend/client";

interface StorePromptData {
  userId?: string;
  message: string;
  conversationHistory?: unknown[];
  type?: string;
  metadata?: Record<string, unknown>;
}

const storePrompt = async (data: StorePromptData): Promise<{ success: boolean; id?: string; error?: string }> => {
  try {
    const promptData = {
      ...data,
      timestamp: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, 'prompts'), promptData);
    return { success: true, id: docRef.id };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('Error storing prompt:', err.code || err.message);
    return { success: false, error: err.message || 'Unknown error' };
  }
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const promptType = searchParams.get('type');
    const maxResults = parseInt(searchParams.get('limit') || '100');

    const constraints: QueryConstraint[] = [];
    if (userId) {
      constraints.push(where('userId', '==', userId));
    }
    if (promptType) {
      constraints.push(where('type', '==', promptType));
    }
    constraints.push(orderBy('timestamp', 'desc'));
    constraints.push(limit(maxResults));

    const querySnapshot = await getDocs(query(collection(db, 'prompts'), ...constraints));

    const prompts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || null
    }));

    return NextResponse.json({ prompts });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('Error fetching prompts:', err.code || err.message);
    return NextResponse.json(
      { error: 'Failed to fetch prompts' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();

    if (!data.message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const result = await storePrompt({
      userId: data.userId || 'anonymous',
      message: data.message,
      conversationHistory: data.conversationHistory || [],
      type: data.type || 'general',
      metadata: data.metadata || {},
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        id: result.id,
        message: 'Prompt stored successfully'
      });
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    console.error('Error processing prompt storage:', err.code || err.message);
    return NextResponse.json(
      { error: 'Failed to process prompt' },
      { status: 500 }
    );
  }
}
