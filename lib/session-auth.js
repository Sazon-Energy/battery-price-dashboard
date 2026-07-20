import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'session';
export const SESSION_DURATION_SECONDS = 8 * 60 * 60; // 8 hours

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken() {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * Verifies a session token. Returns the decoded payload if valid, or null if
 * the token is missing, malformed, expired, or SESSION_SECRET isn't configured.
 * jose throws on any of these cases - caught broadly so a bad cookie 401s
 * cleanly instead of 500ing.
 */
export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload;
  } catch {
    return null;
  }
}

/**
 * Verify the session cookie on a request. Returns null if authorized, or a
 * NextResponse with 401 if not. Used to gate admin-only API routes, mirroring
 * the old requireAdminToken(request) convention.
 */
export async function requireSession(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
