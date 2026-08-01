import 'server-only';
import { supabaseServer } from './supabase';
import {
  CATEGORY_KEYS,
  CLIP_SELECT,
  SHOT_SELECT,
  toClientClip,
  toClientShot,
  type CategoryKey,
  type ClientClip,
  type ClientShot,
} from './wall';

/**
 * Data access for the client-facing surface.
 *
 * Reads go through the client_* views, so even the server-side path can only
 * see keep-verdict clips and client-safe columns; the single exception is the
 * distinctiveness ranking lookup, which reads one internal column server-side
 * and never returns it (results are ordered, the value is dropped).
 */

const escapeLike = (q: string) => q.replace(/[%_\\]/g, (m) => `\\${m}`);

export type SearchResult = ClientClip & { match_hint: string | null };

type Row = Record<string, unknown> & { clip_id: string };
const asRows = (data: unknown): Row[] => (data ?? []) as Row[];

async function rankByDistinctiveness<T extends { clip_id: string }>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const db = supabaseServer();
  const { data } = await db
    .from('clips')
    .select('clip_id,distinctiveness')
    .in('clip_id', rows.map((r) => r.clip_id));
  const rank = new Map<string, number>();
  for (const r of data ?? []) {
    rank.set(r.clip_id, r.distinctiveness === 'high' ? 0 : r.distinctiveness === 'low' ? 2 : 1);
  }
  // high leads; low never appears above standard (Doc 02)
  return [...rows].sort((a, b) => (rank.get(a.clip_id) ?? 1) - (rank.get(b.clip_id) ?? 1));
}

/** Narrow an arbitrary query param to a known category key (or undefined). */
export const asCategory = (v: string | undefined): CategoryKey | undefined =>
  CATEGORY_KEYS.find((k) => k === v);

export async function listClips(limit = 60, offset = 0, category?: CategoryKey): Promise<SearchResult[]> {
  const db = supabaseServer();
  // ORDER BY makes pagination stable — without it Postgres may repeat/skip
  // rows across pages, silently hiding clips from an exhaustive browse.
  let query = db.from('client_clips').select(CLIP_SELECT).order('clip_id', { ascending: true });
  if (category) query = query.contains('categories', [category]);
  const { data, error } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const ranked = await rankByDistinctiveness(asRows(data));
  return ranked.map((r) => ({ ...toClientClip(r), match_hint: null }));
}

/**
 * Clips by explicit id, for the liked list.
 *
 * Likes live in the visitor's own browser, so the page holds ids and asks the
 * server to resolve them. Read through client_clips like everything else, so a
 * cut or unknown id simply drops out rather than leaking. Returned in the
 * caller's order, newest like first.
 */
export async function clipsByIds(ids: string[]): Promise<SearchResult[]> {
  const wanted = ids.filter((id) => typeof id === 'string' && id.length <= 64).slice(0, 200);
  if (wanted.length === 0) return [];
  const db = supabaseServer();
  const { data, error } = await db.from('client_clips').select(CLIP_SELECT).in('clip_id', wanted);
  if (error) throw new Error(error.message);
  const found = new Map(asRows(data).map((r) => [r.clip_id, r]));
  return wanted
    .map((id) => found.get(id))
    .filter((r): r is Row => Boolean(r))
    .map((r) => ({ ...toClientClip(r), match_hint: null }));
}

/** Total visible clips (optionally within one category) — drives pagination. */
export async function countClips(category?: CategoryKey): Promise<number> {
  const db = supabaseServer();
  let query = db.from('client_clips').select('clip_id', { count: 'exact', head: true });
  if (category) query = query.contains('categories', [category]);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Words that carry no search signal on their own — dropped before matching.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'for', 'with', 'to',
  'is', 'are', 'was', 'it', 'its', 'my', 'our', 'your', 'me', 'we', 'i',
  'this', 'that', 'from', 'by', 'as', 'be', 'has', 'have',
]);

// Query words that map straight onto a browse category, so "drinks" finds
// every beverage film even when the word itself never appears in the text.
const CATEGORY_SYNONYMS: Record<string, CategoryKey> = {
  food: 'food', foods: 'food', dish: 'food', meal: 'food',
  // eat/eating describe the ACT, which is what dining is for (0014)
  eat: 'dining', eating: 'dining',
  beverage: 'beverage', beverages: 'beverage', drink: 'beverage', drinks: 'beverage',
  venue: 'venue', venues: 'venue', restaurant: 'venue', restaurants: 'venue',
  event: 'event', events: 'event',
  travel: 'travel', place: 'travel', places: 'travel',
  character: 'characters', characters: 'characters', animal: 'characters', animals: 'characters', mascot: 'characters',
  action: 'action',
  fashion: 'fashion', luxury: 'fashion', couture: 'fashion', model: 'fashion',
  runway: 'fashion', jewellery: 'fashion', jewelry: 'fashion', perfume: 'fashion',
  music: 'music', dance: 'music', dancing: 'music', dancer: 'music', band: 'music',
  song: 'music', concert: 'music', singer: 'music',
  sport: 'sport', sports: 'sport', football: 'sport', soccer: 'sport',
  athlete: 'sport', gym: 'sport', workout: 'sport',
  art: 'art', artist: 'art', painting: 'art', craft: 'art', museum: 'art',
  sculpture: 'art', mural: 'art', manga: 'art',
  lifestyle: 'lifestyle',
  car: 'automotive', cars: 'automotive', driving: 'automotive', motor: 'automotive',
  nature: 'nature', outdoors: 'nature', landscape: 'nature', wildlife: 'nature',
  tech: 'tech', technology: 'tech', gadget: 'tech', robot: 'scifi',
  family: 'family', kids: 'family', children: 'family', child: 'family',
  heritage: 'heritage', culture: 'heritage', traditional: 'heritage', temple: 'heritage',
  beauty: 'beauty', skincare: 'beauty', wellness: 'beauty', spa: 'beauty',
  romance: 'romance', romantic: 'romance', love: 'romance', couple: 'romance',
  scifi: 'scifi', futuristic: 'scifi', cyberpunk: 'scifi', alien: 'scifi',
  dining: 'dining', dinner: 'dining', lunch: 'dining', breakfast: 'dining',
  diner: 'dining', banquet: 'dining', feast: 'dining',
};

/** Split a phrase into deduped, stop-word-free keywords. */
const tokenize = (q: string): string[] => [
  ...new Set(
    q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && !STOP_WORDS.has(w)),
  ),
];

/**
 * Search (rewritten, 0012).
 *
 * EVERY WORD MUST BE PRESENT. The old version split the phrase and surfaced a
 * clip matching ANY keyword, so "girl eating" returned everything containing
 * "girl" or "eating". It also matched substrings, so "car" hit "card", "scar"
 * and "Carnival", and it never looked at the prompt at all — the richest text
 * a clip has. Measured on the live library: "car" returned 516 clips by
 * substring, of which only 110 contained the actual word.
 *
 * The work now happens in public.search_clips (0012): a weighted full-text
 * index over title, summary, the whole prompt and every shot's text, with AND
 * semantics and English stemming, so "eating" also finds "eat" and "eats".
 * Title/summary outrank the prompt, which outranks shot text, so a film ABOUT
 * pizza comes above one that mentions pizza once.
 *
 * Relevance is the returned order — deliberately NOT re-sorted by
 * distinctiveness here, which would override what the user actually asked for.
 *
 * If a strict search finds very little, a category tier is appended BELOW it
 * ("pizza" → the food shelf), clearly labelled so a broadened result is never
 * mistaken for a direct hit.
 */
const BROADEN_BELOW = 8;

export async function searchClips(q: string, limit = 60): Promise<SearchResult[]> {
  const db = supabaseServer();
  const phrase = q.trim();
  if (!phrase) return [];

  const { data, error } = await db.rpc('search_clips', { q: phrase, lim: limit });
  if (error) throw new Error(error.message);

  const rows = asRows(data);
  const strict: SearchResult[] = rows.map((r) => ({
    ...toClientClip(r),
    match_hint: (r.match_hint as string | null) ?? null,
  }));
  if (strict.length >= BROADEN_BELOW || strict.length >= limit) return strict;

  // Too few direct hits — offer the nearest shelf, never mixed in above them.
  const category = tokenize(phrase).map((t) => CATEGORY_SYNONYMS[t]).find(Boolean);
  if (!category) return strict;

  const seen = new Set(strict.map((r) => r.clip_id));
  const { data: catRows } = await db
    .from('client_clips')
    .select(CLIP_SELECT)
    .contains('categories', [category])
    .limit(limit);
  const broadened = asRows(catRows)
    .filter((r) => !seen.has(r.clip_id))
    .slice(0, Math.max(0, limit - strict.length))
    .map((r) => ({ ...toClientClip(r), match_hint: `no exact match — from ${category}` }));

  return [...strict, ...broadened];
}

/** The previous keyword search, kept for reference by the regression fixtures. */
export async function searchClipsLegacy(q: string, limit = 60): Promise<SearchResult[]> {
  const db = supabaseServer();
  const phrase = q.trim();
  const tokens = tokenize(phrase);
  if (tokens.length === 0) tokens.push(phrase.toLowerCase());

  // Per-token matchers across all three surfaces, all in parallel. The
  // library is small (hundreds of clips), so a few queries per token is fine.
  const perToken = await Promise.all(
    tokens.map(async (tok) => {
      const like = `%${escapeLike(tok)}%`;
      const category = CATEGORY_SYNONYMS[tok];
      const [clipRes, shotRes, catRes] = await Promise.all([
        db.from('client_clips').select('clip_id').or(`title.ilike.${like},summary.ilike.${like}`).limit(400),
        db.from('client_shots').select('clip_id,shot_index').ilike('description', like).limit(600),
        category
          ? db.from('client_clips').select('clip_id').contains('categories', [category]).limit(400)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (clipRes.error) throw new Error(clipRes.error.message);
      if (shotRes.error) throw new Error(shotRes.error.message);
      if (catRes.error) throw new Error(catRes.error.message);
      const ids = new Set<string>();
      const shotHits = new Map<string, number>(); // clip_id -> first matching shot
      for (const r of asRows(clipRes.data)) ids.add(r.clip_id);
      for (const r of asRows(shotRes.data)) {
        ids.add(r.clip_id);
        if (!shotHits.has(r.clip_id)) shotHits.set(r.clip_id, r.shot_index as number);
      }
      for (const r of asRows(catRes.data)) ids.add(r.clip_id);
      return { tok, ids, shotHits };
    }),
  );

  // Exact-phrase layer (only meaningful for multi-word queries).
  const phraseIds = new Set<string>();
  if (tokens.length > 1) {
    const like = `%${escapeLike(phrase)}%`;
    const [clipRes, shotRes] = await Promise.all([
      db.from('client_clips').select('clip_id').or(`title.ilike.${like},summary.ilike.${like}`).limit(400),
      db.from('client_shots').select('clip_id').ilike('description', like).limit(400),
    ]);
    for (const r of asRows(clipRes.data)) phraseIds.add(r.clip_id);
    for (const r of asRows(shotRes.data)) phraseIds.add(r.clip_id);
  }

  // Score: exact phrase ≫ all keywords ≫ more keywords ≫ one keyword.
  const matched = new Map<string, { count: number; toks: string[]; shot: number | null }>();
  for (const { tok, ids, shotHits } of perToken) {
    for (const id of ids) {
      const m = matched.get(id) ?? { count: 0, toks: [], shot: null };
      m.count += 1;
      m.toks.push(tok);
      if (m.shot === null && shotHits.has(id)) m.shot = shotHits.get(id)!;
      matched.set(id, m);
    }
  }
  if (matched.size === 0) return [];

  const score = (id: string) =>
    (phraseIds.has(id) ? 1000 : 0) + (matched.get(id)!.count === tokens.length ? 100 : 0) + matched.get(id)!.count;

  // Order ids by relevance, keep the top slice, then fetch card data once.
  const orderedIds = [...matched.keys()].sort((a, b) => score(b) - score(a)).slice(0, limit);
  const { data, error } = await db.from('client_clips').select(CLIP_SELECT).in('clip_id', orderedIds);
  if (error) throw new Error(error.message);
  const byId = new Map(asRows(data).map((r) => [r.clip_id, r]));

  // Distinctiveness only breaks ties inside the same relevance score.
  const distinctOrder = await rankByDistinctiveness(orderedIds.map((id) => ({ clip_id: id })));
  const distinctRank = new Map(distinctOrder.map((r, i) => [r.clip_id, i]));
  orderedIds.sort(
    (a, b) => score(b) - score(a) || (distinctRank.get(a) ?? 0) - (distinctRank.get(b) ?? 0),
  );

  return orderedIds
    .filter((id) => byId.has(id))
    .map((id) => {
      const m = matched.get(id)!;
      const full = phraseIds.has(id) || m.count === tokens.length;
      return {
        ...toClientClip(byId.get(id)!),
        // "why it surfaced": partial keyword matches say which words hit;
        // shot-level matches point at the beat, like before.
        match_hint: !full && tokens.length > 1
          ? `matches ${m.toks.join(', ')}`
          : m.shot !== null
            ? `matches shot ${m.shot}`
            : null,
      };
    });
}

export async function getClip(clipId: string): Promise<{ clip: ClientClip; shots: ClientShot[] } | null> {
  const db = supabaseServer();
  const { data: clip } = await db.from('client_clips').select(CLIP_SELECT).eq('clip_id', clipId).maybeSingle();
  if (!clip) return null; // unknown OR cut — cuts do not exist to the client
  const { data: shots, error } = await db
    .from('client_shots')
    .select(SHOT_SELECT)
    .eq('clip_id', clipId)
    .order('shot_index', { ascending: true });
  if (error) throw new Error(error.message);
  return {
    clip: toClientClip(clip as unknown as Record<string, unknown>),
    shots: asRows(shots).map((s) => toClientShot(s)),
  };
}

/**
 * Related clips for a detail page — other keep-verdict films from the library,
 * excluding the current one. Read through the client_clips view, so only
 * client-safe columns and only keeps can ever surface (the wall holds).
 */
export async function relatedClips(clipId: string, limit = 3): Promise<SearchResult[]> {
  const db = supabaseServer();
  // over-fetch a little, then drop the current clip and cap at `limit`
  const { data, error } = await db
    .from('client_clips')
    .select(CLIP_SELECT)
    .neq('clip_id', clipId)
    .limit(limit + 4);
  if (error) throw new Error(error.message);
  return asRows(data)
    .filter((r) => r.clip_id !== clipId)
    .slice(0, limit)
    .map((r) => ({ ...toClientClip(r), match_hint: null }));
}

export async function saveSelection(input: {
  clip_id: string;
  shot_indexes: number[];
  client_name?: string;
  client_email?: string;
  note?: string;
}): Promise<{ id: string }> {
  const db = supabaseServer();
  // Selections are only valid against clips a client can see (keeps).
  const { data: clip } = await db.from('client_clips').select('clip_id,shot_count').eq('clip_id', input.clip_id).maybeSingle();
  if (!clip) throw new Error('unknown clip');
  const indexes = [...new Set(input.shot_indexes)].filter(
    (n) => Number.isInteger(n) && n >= 1 && n <= (clip.shot_count ?? 999),
  );
  if (indexes.length === 0) throw new Error('no valid shots selected');
  const { data, error } = await db
    .from('client_selection')
    .insert({
      clip_id: input.clip_id,
      shot_indexes: indexes,
      client_name: input.client_name?.slice(0, 200) || null,
      client_email: input.client_email?.slice(0, 200) || null,
      note: input.note?.slice(0, 2000) || null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}
