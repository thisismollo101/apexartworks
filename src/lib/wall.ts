/**
 * THE VISIBILITY WALL — single source of truth for what a client may ever see.
 *
 * Derived from the `visibility` column of data/apex_schema.csv and PRD §5.
 * Every client-facing API response is built by picking exactly these fields.
 * Everything else — shot.verbatim_text (the IP), the internal tags, the gate
 * fields, source_url — never appears in any response, by construction.
 *
 * The database enforces the same wall independently (RLS deny-all on the
 * master tables; anon can only read the client_clips / client_shots views).
 * This module is the application layer of that defense in depth.
 */

export const CLIP_CLIENT_FIELDS = [
  'clip_id', // opaque catalog number, safe as a route param (PRD §5.3)
  'title',
  'summary',
  'runtime_s',
  'aspect_ratio',
  'shot_count',
  'video_url',
  'thumbnail_url',
] as const;

export const SHOT_CLIENT_FIELDS = [
  'clip_id',
  'shot_index',
  'description',
  'shot_deeplink',
] as const;

export type ClientClip = {
  clip_id: string;
  title: string | null;
  summary: string | null;
  runtime_s: number | null;
  aspect_ratio: string | null;
  shot_count: number | null;
  video_url: string | null;
  thumbnail_url: string | null;
};

export type ClientShot = {
  clip_id: string;
  shot_index: number;
  description: string | null;
  shot_deeplink: string | null;
};

/** Column list for .select() against the client views. */
export const CLIP_SELECT = CLIP_CLIENT_FIELDS.join(',');
export const SHOT_SELECT = SHOT_CLIENT_FIELDS.join(',');

/**
 * Belt-and-braces: re-pick only the allowlisted fields from a row before it
 * is serialized into a response, so an accidental `select('*')` or a widened
 * view can never leak an internal column through the API layer.
 */
function pick<T extends object>(row: Record<string, unknown>, fields: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = row[f] ?? null;
  return out as T;
}

export const toClientClip = (row: Record<string, unknown>): ClientClip =>
  pick<ClientClip>(row, CLIP_CLIENT_FIELDS);

export const toClientShot = (row: Record<string, unknown>): ClientShot =>
  pick<ClientShot>(row, SHOT_CLIENT_FIELDS);
