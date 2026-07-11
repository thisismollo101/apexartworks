import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Magic-link callback → session cookie → /admin.
 *
 * Handles both link styles:
 *  - default Supabase email template (no custom SMTP): PKCE flow, arrives as
 *    ?code=… and is exchanged with the verifier cookie set at sign-in — the
 *    link must be opened in the same browser that requested it;
 *  - customized template ({{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=magiclink):
 *    arrives as ?token_hash=… and is verified directly.
 *
 * Creating a session grants no data access (RLS deny-all); adminhood is
 * decided per-request by assertAdmin().
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const type = (req.nextUrl.searchParams.get('type') ?? 'magiclink') as EmailOtpType;
  const redirect = NextResponse.redirect(new URL('/admin', req.url));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if ((!code && !tokenHash) || !url || !anonKey) return redirect;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          redirect.cookies.set(name, value, options);
        }
      },
    },
  });

  if (code) await supabase.auth.exchangeCodeForSession(code);
  else if (tokenHash) await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  return redirect; // success or failure, land on /admin — it decides what to show
}
