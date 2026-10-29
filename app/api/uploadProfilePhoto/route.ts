import { NextResponse } from 'next/server';
import { saveFile, localFileUrl } from '../../lib/backend/files-server';
import { assertLocalRequest, requireLocalSession } from '../../lib/backend/local-session';

export async function POST(request: Request) {
  try {
    assertLocalRequest(request);
    const user = await requireLocalSession(request);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'An image file is required' }, { status: 400 });
    const key = `profilePhotos/${user.uid}/${Date.now()}-${crypto.randomUUID()}`;
    await saveFile(key, new Uint8Array(await file.arrayBuffer()), file.type);
    return NextResponse.json({ photoUrl: localFileUrl(key) });
  } catch {
    return NextResponse.json({ error: 'Profile photo upload rejected' }, { status: 400 });
  }
}
