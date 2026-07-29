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

const CHUNK = 8; // concurrent lookups against X

export async function GET(req: Request) {
  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit')) || 120, 400);
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

  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    await Promise.all(
      batch.map(async (row) => {
        const id = tweetIdFrom(row.source_url);
        if (!id) return void noMedia++;
        const media = await getTweetMedia(id);
        if (!media?.poster) return void noMedia++;
        const { error: upErr } = await db
          .from('clips')
          .update({ thumbnail_url: media.poster })
          .eq('clip_id', row.clip_id);
        if (upErr) failures.push(`${row.clip_id}: ${upErr.message}`);
        else updated++;
      }),
    );
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
