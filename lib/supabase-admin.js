import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the service role key.
 * Use ONLY in API routes / server code; never expose this client to the browser.
 *
 * Lazily instantiated so that build-time page data collection does not fail when
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not present in the
 * build environment.
 */
let cached = null;

export function getSupabaseAdmin() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase admin client not configured (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required)');
  }
  cached = createClient(url, key);
  return cached;
}
