import { NextResponse } from 'next/server';

/**
 * Verify the admin token on a request. Returns null if authorized, or a
 * NextResponse with 401 if not. Used to gate admin-only API routes.
 *
 * The token is read from the X-Admin-Token header and compared to
 * process.env.ADMIN_TOKEN. If ADMIN_TOKEN is not configured on the server,
 * the route is locked (returns 401) rather than open by default.
 */
export function requireAdminToken(request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'Admin endpoint not configured (ADMIN_TOKEN missing)' },
      { status: 401 }
    );
  }

  const provided = request.headers.get('x-admin-token');
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
