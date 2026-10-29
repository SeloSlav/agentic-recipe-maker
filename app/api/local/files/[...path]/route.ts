import { NextResponse } from "next/server";
import { assertLocalRequest, requireLocalSession } from "../../../../lib/backend/local-session";
import { loadFile, removeFile, saveFile } from "../../../../lib/backend/files-server";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    assertLocalRequest(request);
    const key = (await context.params).path.join("/");
    if (key.endsWith(".metadata.json")) throw new Error("Invalid file");
    const file = await loadFile(key);
    return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": file.contentType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=60" } });
  } catch { return NextResponse.json({ error: "File not found" }, { status: 404 }); }
}
export async function PUT(request: Request, context: Context) {
  try {
    assertLocalRequest(request); await requireLocalSession(request);
    if (Number(request.headers.get("content-length")) > 20 * 1024 * 1024) throw new Error("Image too large");
    await saveFile((await context.params).path.join("/"), new Uint8Array(await request.arrayBuffer()), request.headers.get("content-type") || "image/png");
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Local image upload rejected" }, { status: 400 }); }
}
export async function DELETE(request: Request, context: Context) {
  try { assertLocalRequest(request); await requireLocalSession(request); await removeFile((await context.params).path.join("/")); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Local image deletion rejected" }, { status: 400 }); }
}
