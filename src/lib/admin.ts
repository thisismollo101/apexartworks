import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseServer } from './supabase';

/**
 * ADMIN SURFACE — prompts only, behind a CLOSED email allowlist.
 *
 * The allowlist lives in ADMIN_EMAILS (server-only env, comma-separated),
 * never in source. A missing or empty ADMIN_EMAILS means NOBODY is admin —
 * fail closed, never open. Any session whose verified email is not an exact
 * case-insensitive match gets the same 404 as no session at all.
 *
 * Auth sessions are created with the public anon key, which grants zero
 * table access (RLS deny-all, no policies). Data is read with the service
 * role only AFTER assertAdmin() passes, and only through the explicit
 * field allowlists below — never select *.
 */

export const ADMIN_CLIP_FIELDS = [
  'clip_id',
  'title',
  'summary',
  'runtime_s',
  'shot_count',
  'verbatim_prompt',
] as const;

export const ADMIN_SHOT_FIELDS = ['shot_index', 'description', 'verbatim_text'] as const;

export type AdminClip = {
  clip_id: string;
  title: string | null;
  summary: string | null;
  runtime_s: number | null;
  shot_count: number | null;
  verbatim_prompt: string | null;
};

export type AdminShot = {
  shot_index: number;
  description: string | null;
  verbatim_text: string | null;
};

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function anonAuthEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/**
 * True only if the request carries a VERIFIED session whose email is on the
 * closed allowlist. Reads the cookie session; an API caller may instead send
 * `Authorization: Bearer <access token>` (used by the wall audit).
 * Every failure path — no env, no session, unverified, not allowlisted —
 * returns false.
 */
export async function assertAdmin(req?: Request): Promise<boolean> {
  try {
    const allowed = adminEmails();
    if (allowed.size === 0) return false; // fail closed

    const env = anonAuthEnv();
    if (!env) return false;

    let email: string | undefined;

    const bearer = req?.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearer) {
      const { createClient } = await import('@supabase/supabase-js');
      const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false } });
      const { data, error } = await anon.auth.getUser(bearer);
      if (error) return false;
      email = data.user?.email;
    } else {
      const cookieStore = await cookies();
      const supabase = createServerClient(env.url, env.anonKey, {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {}, // read-only in RSC/route context
        },
      });
      const { data, error } = await supabase.auth.getUser(); // verified against the auth server
      if (error) return false;
      email = data.user?.email;
    }

    return !!email && allowed.has(email.trim().toLowerCase());
  } catch {
    return false; // fail closed on any error
  }
}

/**
 * Admin read: prompts only. Keep-verdict clips only — cut clips do not exist
 * in the admin viewer either (they 404, exactly like unknown ids).
 * No tags, no gate fields.
 */
export async function getAdminClip(
  clipId: string,
): Promise<{ clip: AdminClip; shots: AdminShot[] } | null> {
  const db = supabaseServer();
  const { data: clip } = await db
    .from('clips')
    .select(ADMIN_CLIP_FIELDS.join(','))
    .eq('clip_id', clipId)
    .eq('verdict', 'keep')
    .maybeSingle();
  if (!clip) return null;

  const { data: shots, error } = await db
    .from('shots')
    .select(ADMIN_SHOT_FIELDS.join(','))
    .eq('clip_id', clipId)
    .order('shot_index', { ascending: true });
  if (error) throw new Error(error.message);

  const pick = <T,>(row: Record<string, unknown>, fields: readonly string[]): T => {
    const out: Record<string, unknown> = {};
    for (const f of fields) out[f] = row[f] ?? null;
    return out as T;
  };

  return {
    clip: pick<AdminClip>(clip as unknown as Record<string, unknown>, ADMIN_CLIP_FIELDS),
    shots: ((shots ?? []) as unknown as Record<string, unknown>[]).map((s) =>
      pick<AdminShot>(s, ADMIN_SHOT_FIELDS),
    ),
  };
}
