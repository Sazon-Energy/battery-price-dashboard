import { NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '../../../lib/session-auth';

// Always returns 200 - this is a cheap "am I logged in" check for the client
// to poll, not a gate, so it deliberately doesn't reuse requireSession's
// 401-response shape.
export async function GET(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);
  return NextResponse.json({ authenticated: !!payload });
}
