/**
 * THE VISIBILITY WALL — single source of truth for what a client may ever see.
 *
 * Derived from the `visibility` column of data/apex_schema.csv and PRD §5.
 * Every client-facing API response is built by picking exactly these fields.
 *
 * OWNER OVERRIDE (Aidan, 2026-07-13): shot `verbatim_text` and clip
 * `source_url` are now DELIBERATELY client-facing (open showcase) and are in
 * the allowlists below. The wall still keeps everything else out — clip-level
 * `verbatim_prompt` (the full raw prompt, admin-only), the internal tags, and
 * the gate fields never appear in any client response, by construction.
 *
 * The database enforces the same wall independently (RLS deny-all on the
 * master tables; anon can only read the client_clips / client_shots views,
 * which now include verbatim_text + source_url per the override).
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
  // Owner override (Aidan, 2026-07-13): the original source link is now shown
  // publicly as the watchable link, since no hosted video_url assets exist yet.
  'source_url',
  // Curated browse facets (0004): fixed-enum values derived at load time from
  // the internal tags. The raw tags themselves stay behind the wall.
  'categories',
] as const;

/** The only values `categories` may ever contain (0004_categories.sql). */
export const CATEGORY_KEYS = [
  'food',
  'beverage',
  'venue',
  'event',
  'travel',
  'characters',
  'action',
  'fashion',
  'music',
  'sport',
  'lifestyle',
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const SHOT_CLIENT_FIELDS = [
  'clip_id',
  'shot_index',
  'description',
  'shot_deeplink',
  // Owner override (Aidan, 2026-07-13): the per-shot verbatim prompt is now
  // shown publicly alongside the English description, per explicit request.
  'verbatim_text',
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
  source_url: string | null;
  categories: string[] | null;
};

export type ClientShot = {
  clip_id: string;
  shot_index: number;
  description: string | null;
  shot_deeplink: string | null;
  verbatim_text: string | null;
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
