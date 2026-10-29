import { NextResponse } from "next/server";
import { assertLocalRequest, COOKIE_NAME, issueLocalToken, LOCAL_USER, requestToken, verifyLocalToken } from "../../../lib/backend/local-session";

export async function GET(request: Request) {
  try {
    assertLocalRequest(request);
    const token = requestToken(request);
    if (!token) return NextResponse.json({ user: null });
    await verifyLocalToken(token);
    return NextResponse.json({ user: LOCAL_USER, token }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ user: null }); }
}
export async function POST(request: Request) {
  try {
    assertLocalRequest(request);
    const token = await issueLocalToken();
    const response = NextResponse.json({ user: LOCAL_USER, token });
    response.cookies.set(COOKIE_NAME, token, { httpOnly: true, sameSite: "strict", path: "/", maxAge: 7 * 86400 });
    return response;
  } catch { return NextResponse.json({ error: "Local sign-in unavailable. Start with npm run dev:local." }, { status: 403 }); }
}
export async function DELETE(request: Request) {
  try { assertLocalRequest(request); } catch { return NextResponse.json({ error: "Unavailable" }, { status: 403 }); }
  const response = NextResponse.json({ ok: true }); response.cookies.delete(COOKIE_NAME); return response;
}
