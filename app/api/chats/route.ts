import { NextResponse } from 'next/server';
import { serverDb, serverAuth } from "../../lib/backend/admin";

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
}

export interface ChatDoc {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// GET: List user's chats (with Pro/free tier limits applied server-side for security)
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await serverAuth.verifyToken(idToken);
    const userId = decoded.uid;

    const userDoc = await serverDb.collection('users').doc(userId).get();
    const plan = userDoc.data()?.plan ?? 'free';
    const adminDoc = await serverDb.collection('admins').doc(userId).get();
    const isAdmin = adminDoc.exists && adminDoc.data()?.active === true;

    if (plan !== 'pro' && !isAdmin) {
      return NextResponse.json({ chats: [], plan });
    }

    const chatsRef = serverDb.collection('chats');
    const snapshot = await chatsRef.where('userId', '==', userId).get();

    const chats = snapshot.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          title: d.title || 'New Chat',
          pinned: d.pinned || false,
          createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? null,
          updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() ?? null,
          messageCount: Array.isArray(d.messages) ? d.messages.length : 0,
        };
      })
      .sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });

    return NextResponse.json({ chats, plan });
  } catch (error) {
    console.error('Error fetching chats:', error);
    return NextResponse.json({ error: 'Failed to fetch chats' }, { status: 500 });
  }
}

// POST: Create new chat (Pro only)
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await serverAuth.verifyToken(idToken);
    const userId = decoded.uid;

    const userDoc = await serverDb.collection('users').doc(userId).get();
    const adminDoc = await serverDb.collection('admins').doc(userId).get();
    const isAdmin = adminDoc.exists && adminDoc.data()?.active === true;
    if (userDoc.data()?.plan !== 'pro' && !isAdmin) {
      return NextResponse.json({ error: 'Pro subscription required to save chats' }, { status: 403 });
    }

    const body = await req.json();
    const { title = 'New Chat', messages = [] } = body;

    const sanitized = (Array.isArray(messages) ? messages : []).map((m: { role?: string; content?: string; imageUrl?: string }) => ({
      role: m.role || 'user',
      content: String(m.content || ''),
      ...(m.imageUrl && !String(m.imageUrl).startsWith('blob:') ? { imageUrl: m.imageUrl } : {}),
    }));

    const chatRef = await serverDb.collection('chats').add({
      userId,
      title: String(title).slice(0, 200),
      messages: sanitized,
      pinned: false,
      createdAt: serverDb.transforms.serverTimestamp(),
      updatedAt: serverDb.transforms.serverTimestamp(),
    });

    return NextResponse.json({ id: chatRef.id });
  } catch (error) {
    console.error('Error creating chat:', error);
    return NextResponse.json({ error: 'Failed to create chat' }, { status: 500 });
  }
}
