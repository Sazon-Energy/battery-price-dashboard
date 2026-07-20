import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createSessionToken, COOKIE_NAME, SESSION_DURATION_SECONDS } from '../../../lib/session-auth';

function passwordsMatch(provided, expected) {
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length) {
    // Still run a same-length comparison so a mismatched length isn't a
    // trivially fast rejection - not bulletproof, but avoids the cheapest
    // timing signal for this single-operator, low-stakes login.
    timingSafeEqual(providedBuffer, providedBuffer);
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function POST(request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: 'Login not configured' }, { status: 401 });
  }

  let password;
  try {
    ({ password } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (typeof password !== 'string' || !passwordsMatch(password, expected)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  });
  return response;
}
