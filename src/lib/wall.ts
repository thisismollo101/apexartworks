/**
 * THE VISIBILITY WALL — single source of truth for what a client may ever see.
 *
 * Derived from the `visibility` column of data/apex_schema.csv and PRD §5.
 * Every client-facing API response is built by picking exactly these fields.
 *
 * OWNER OVERRIDE (Aidan, 2026-07-13): shot `verbatim_text` and clip
 * `source_url` are DELIBERATELY client-facing (open showcase).
 *
 * OWNER OVERRIDE (Aidan, 2026-07-29): clip `verbatim_prompt` — the full raw
 * prompt — is now client-facing too, so the clip page can show the whole
 * prompt in one block alongside the per-shot breakdown (0009). The global
 * "Style & Feel" / "Audio" directives exist only in this column.
 *
 * ATTRIBUTION (0010): the author/licence columns are also client-facing, but
 * they are not an override — they are new columns that exist precisely to be
 * shown. Prompts imported from a CC BY 4.0 collection may only be displayed
 * WITH credit, so hiding these would breach the licence rather than protect
 * anything.
 *
 * The wall still keeps everything else out — the internal tags, the gate
 * fields, and prompt_health / source_prompt_file never appear in any client
 * response, by construction.
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
  // Owner override (Aidan, 2026-07-29): the full raw prompt, shown as one
  // block on the clip page next to the per-shot breakdown (0009).
  'verbatim_prompt',
  // Attribution (0010). Not an override of the wall: these are new columns
  // carrying the credit that the imported prompts' CC BY 4.0 licence REQUIRES.
  // They must reach the client — an uncredited display would breach the
  // licence. NULL on our own originals, where no credit line renders.
  'author_name',
  'author_url',
  'license',
  'license_url',
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
  'art',
  'lifestyle',
  'automotive',
  'nature',
  'tech',
  'family',
  'heritage',
  'beauty',
  'romance',
  'scifi',
  'dining',
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
  verbatim_prompt: string | null;
  author_name: string | null;
  author_url: string | null;
  license: string | null;
  license_url: string | null;
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
