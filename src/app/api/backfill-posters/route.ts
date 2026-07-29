/**
 * TEMPORARY one-off backfill — delete once every clip has a poster.
 *
 * Listing cards fall back to a bare play mark because clips.thumbnail_url is
 * null for all 766 films. The source post already carries a poster frame on
 * pbs.twimg.com (which, unlike video.twimg.com, serves fine with a Referer),
 * so this fills the column in from X.
 *
 * It runs here rather than as a script because this session's container cannot
 * reach x.com; a Vercel function can.
 *
 * Deliberately takes no target from the caller: it reads source_url from the
 * database, only ever fills rows where thumbnail_url IS NULL, and never
 * overwrites. The worst it can do is exactly its job.
 */
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { tweetIdFrom } from '@/lib/tweet';
import { getTweetMedia } from '@/lib/tweetMedia';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Uncached resolver for the retry pass.
 *
 * getTweetMedia caches for a day, so a clip that failed because the first
 * sweep hit X's rate limit would just replay that cached failure on a retry.
 * ?fresh=1 re-asks X directly, slowly.
 */
function syndicationToken(id: string): string {
  return ((Number(id) / 1e6) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

async function posterFresh(id: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${syndicationToken(id)}`,
      { headers: { 'user-agent': 'Mozilla/5.0 (compatible; ApexArtworks/1.0)' }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const media = (json.mediaDetails ?? []).find(
      (m: { type?: string; media_url_https?: string }) => m.media_url_https,
    );
    return media?.media_url_https ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 120, 400);
  const fresh = url.searchParams.get('fresh') === '1';
  // Gentler on the retry pass — the first sweep's misses look like rate limiting.
  const chunk = fresh ? 3 : 8;
  const db = supabaseServer();

  const { data, error } = await db
    .from('clips')
    .select('clip_id,source_url')
    .is('thumbnail_url', null)
    .not('source_url', 'is', null)
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as { clip_id: string; source_url: string }[];
  let updated = 0;
  let noMedia = 0;
  const failures: string[] = [];

  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    await Promise.all(
      batch.map(async (row) => {
        const id = tweetIdFrom(row.source_url);
        if (!id) return void noMedia++;
        const poster = fresh ? await posterFresh(id) : (await getTweetMedia(id))?.poster ?? null;
        if (!poster) return void noMedia++;
        const { error: upErr } = await db
          .from('clips')
          .update({ thumbnail_url: poster })
          .eq('clip_id', row.clip_id);
        if (upErr) failures.push(`${row.clip_id}: ${upErr.message}`);
        else updated++;
      }),
    );
    if (fresh) await new Promise((r) => setTimeout(r, 400));
  }

  const { count: remaining } = await db
    .from('clips')
    .select('clip_id', { count: 'exact', head: true })
    .is('thumbnail_url', null)
    .not('source_url', 'is', null);

  return NextResponse.json(
    { scanned: rows.length, updated, noMedia, failures: failures.slice(0, 10), remaining },
    { headers: { 'cache-control': 'no-store' } },
  );
}
