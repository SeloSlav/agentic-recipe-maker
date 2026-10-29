import { NextResponse } from 'next/server';
import { serverDb, serverAuth } from "../../lib/backend/admin";

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

    return NextResponse.json({ userId, plan });
  } catch (error) {
    console.error('Error in /api/me:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
