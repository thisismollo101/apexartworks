import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the SERVICE ROLE key.
 *
 * The key lives in a server-only env var (never NEXT_PUBLIC_*), so it is
 * never bundled for the browser; the `server-only` import makes any client
 * component that tries to import this module a build error.
 *
 * All client-facing reads still go through the client_* views + the wall.ts
 * allowlists — the service role is an implementation detail of the server,
 * not a licence to ship internal columns.
 */
let cached: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
