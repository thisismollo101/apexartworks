import 'server-only';
import { supabaseServer } from './supabase';
import { CLIP_SELECT, SHOT_SELECT, toClientClip, toClientShot, type ClientClip, type ClientShot } from './wall';

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

export async function listClips(limit = 60, offset = 0): Promise<SearchResult[]> {
  const db = supabaseServer();
  const { data, error } = await db.from('client_clips').select(CLIP_SELECT).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const ranked = await rankByDistinctiveness(asRows(data));
  return ranked.map((r) => ({ ...toClientClip(r), match_hint: null }));
}

/**
 * Two-layer search (PRD §6): match clip title/summary OR any client-safe
 * shot description. A clip surfaces on "pasta" whether it was tagged or
 * merely described as twirling pasta.
 */
export async function searchClips(q: string, limit = 60): Promise<SearchResult[]> {
  const db = supabaseServer();
  const like = `%${escapeLike(q.trim())}%`;

  const [clipRes, shotRes] = await Promise.all([
    db.from('client_clips').select(CLIP_SELECT).or(`title.ilike.${like},summary.ilike.${like}`).limit(limit),
    db.from('client_shots').select('clip_id,shot_index,description').ilike('description', like).limit(200),
  ]);
  if (clipRes.error) throw new Error(clipRes.error.message);
  if (shotRes.error) throw new Error(shotRes.error.message);

  const hints = new Map<string, string>();
  for (const s of asRows(shotRes.data)) {
    if (!hints.has(s.clip_id)) hints.set(s.clip_id, `matches shot ${s.shot_index}`);
  }

  const byId = new Map<string, Row>();
  const directIds = new Set<string>();
  for (const c of asRows(clipRes.data)) {
    byId.set(c.clip_id, c);
    directIds.add(c.clip_id);
  }

  // Clips that matched only via a shot description still need their card data
  const shotOnlyIds = [...hints.keys()].filter((id) => !byId.has(id)).slice(0, limit);
  if (shotOnlyIds.length) {
    const { data } = await db.from('client_clips').select(CLIP_SELECT).in('clip_id', shotOnlyIds);
    for (const c of asRows(data)) byId.set(c.clip_id, c);
  }

  const ranked = await rankByDistinctiveness([...byId.values()]);
  return ranked.slice(0, limit).map((r) => ({
    ...toClientClip(r),
    // the muted "why it surfaced" hint — only for shot-description matches
    match_hint: directIds.has(r.clip_id) ? null : hints.get(r.clip_id) ?? null,
  }));
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
