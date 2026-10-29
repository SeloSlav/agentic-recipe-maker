import { NextResponse, type NextRequest } from 'next/server';

/** The bundled developer account is intended for loopback access only. */
export function middleware(request: NextRequest) {
  const url = new URL(`${request.nextUrl.protocol}//${request.headers.get('host') || request.nextUrl.host}`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return NextResponse.json({ error: 'This local development app only accepts loopback requests.' }, { status: 403 });
  }
  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Cross-origin local requests are not allowed.' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
