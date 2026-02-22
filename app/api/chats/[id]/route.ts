import { NextResponse } from 'next/server';
import { admin } from '../../../firebase/firebaseAdmin';

const MAX_PINNED_CHATS = 3;

// GET: Fetch single chat (Pro only)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userId = decoded.uid;
    const { id } = await params;

    const chatDoc = await admin.firestore().collection('chats').doc(id).get();
    if (!chatDoc.exists) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const data = chatDoc.data()!;
    if (data.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const adminDoc = await admin.firestore().collection('admins').doc(userId).get();
    const isAdmin = adminDoc.exists && adminDoc.data()?.active === true;
    if (userDoc.data()?.plan !== 'pro' && !isAdmin) {
      return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
    }

    return NextResponse.json({
      id: chatDoc.id,
      title: data.title || 'New Chat',
      messages: data.messages || [],
      pinned: data.pinned || false,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
    });
  } catch (error) {
    console.error('Error fetching chat:', error);
    return NextResponse.json({ error: 'Failed to fetch chat' }, { status: 500 });
  }
}

// PATCH: Update chat (messages, title, pinned)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userId = decoded.uid;
    const { id } = await params;

    const chatRef = admin.firestore().collection('chats').doc(id);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const data = chatDoc.data()!;
    if (data.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const adminDoc = await admin.firestore().collection('admins').doc(userId).get();
    const isAdmin = adminDoc.exists && adminDoc.data()?.active === true;
    if (userDoc.data()?.plan !== 'pro' && !isAdmin) {
      return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (typeof body.title === 'string') updates.title = body.title.slice(0, 200);
    if (Array.isArray(body.messages)) updates.messages = body.messages;
    if (typeof body.pinned === 'boolean') {
      // Enforce pinned limit server-side to prevent bypassing UI checks.
      if (body.pinned && !data.pinned) {
        const pinnedSnapshot = await admin
          .firestore()
          .collection('chats')
          .where('userId', '==', userId)
          .where('pinned', '==', true)
          .get();

        if (pinnedSnapshot.size >= MAX_PINNED_CHATS) {
          return NextResponse.json(
            { error: `You can pin up to ${MAX_PINNED_CHATS} conversations. Unpin one first.` },
            { status: 400 }
          );
        }
      }
      updates.pinned = body.pinned;
    }

    await chatRef.update(updates);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating chat:', error);
    return NextResponse.json({ error: 'Failed to update chat' }, { status: 500 });
  }
}

// DELETE: Delete chat
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userId = decoded.uid;
    const { id } = await params;

    const chatDoc = await admin.firestore().collection('chats').doc(id).get();
    if (!chatDoc.exists) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (chatDoc.data()!.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const adminDoc = await admin.firestore().collection('admins').doc(userId).get();
    const isAdmin = adminDoc.exists && adminDoc.data()?.active === true;
    if (userDoc.data()?.plan !== 'pro' && !isAdmin) {
      return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 });
    }

    await admin.firestore().collection('chats').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
  }
}
