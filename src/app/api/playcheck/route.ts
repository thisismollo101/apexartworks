/**
 * TEMPORARY playback verification — delete once confirmed.
 *
 * The clip page renders <video src="https://video.twimg.com/...">, but proving
 * the element exists is not proving the film plays. This container cannot
 * reach video.twimg.com (egress policy), so the check runs from a Vercel
 * function, which can.
 *
 * For a few real clips it fetches the head of the MP4 and reports whether the
 * bytes are actually a playable video:
 *   - HTTP status, content-type, accept-ranges (the browser needs ranges to
 *     stream and seek)
 *   - the MP4 box structure (ftyp / moov / mdat)
 *   - the codecs present — avc1 is H.264, mp4a is AAC
 *
 * It fetches twice: once with no Referer, which is what the site sends (the
 * layout sets referrer: no-referrer), and once with one, since video.twimg.com
 * is known to gate on Referer. That difference is the whole reason the
 * no-referrer policy is there, so it is worth measuring rather than assuming.
 *
 * Takes no target from the caller: clips come from the database.
 */
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { tweetIdFrom } from '@/lib/tweet';
import { getTweetMedia } from '@/lib/tweetMedia';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Top-level MP4 box types, read by walking size/type pairs from offset 0. */
function boxes(buf: Uint8Array): string[] {
  const out: string[] = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 0;
  while (off + 8 <= buf.byteLength && out.length < 12) {
    let size = dv.getUint32(off);
    const type = String.fromCharCode(...buf.slice(off + 4, off + 8));
    if (!/^[a-zA-Z0-9 ]{4}$/.test(type)) break;
    out.push(type);
    if (size === 1) {
      if (off + 16 > buf.byteLength) break;
      size = Number(dv.getBigUint64(off + 8));
    }
    if (size <= 0) break;
    off += size;
  }
  return out;
}

const has = (buf: Uint8Array, needle: string) => {
  const n = [...needle].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i + n.length <= buf.byteLength; i++) {
    for (let j = 0; j < n.length; j++) if (buf[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
};

async function probeMp4(url: string, referer?: string) {
  try {
    const res = await fetch(url, {
      headers: {
        range: 'bytes=0-262143',
        'user-agent': 'Mozilla/5.0 (compatible; ApexArtworks/1.0)',
        ...(referer ? { referer } : {}),
      },
      cache: 'no-store',
    });
    if (!res.ok && res.status !== 206) {
      return { status: res.status, ok: false as const };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      status: res.status,
      ok: true as const,
      contentType: res.headers.get('content-type'),
      acceptRanges: res.headers.get('accept-ranges'),
      contentRange: res.headers.get('content-range'),
      bytesRead: buf.byteLength,
      boxes: boxes(buf),
      h264_avc1: has(buf, 'avc1'),
      aac_mp4a: has(buf, 'mp4a'),
    };
  } catch (e) {
    return { status: 'THREW' as const, ok: false as const, error: String(e) };
  }
}

export async function GET() {
  const db = supabaseServer();
  const { data } = await db
    .from('clips')
    .select('clip_id,source_url')
    .not('thumbnail_url', 'is', null)
    .limit(3);

  const results = [];
  for (const row of (data ?? []) as { clip_id: string; source_url: string }[]) {
    const id = tweetIdFrom(row.source_url);
    const media = id ? await getTweetMedia(id) : null;
    if (!media) {
      results.push({ clip_id: row.clip_id, resolved: false });
      continue;
    }
    results.push({
      clip_id: row.clip_id,
      resolved: true,
      mp4: media.mp4,
      durationMs: media.durationMs,
      asBrowserSends_noReferer: await probeMp4(media.mp4),
      withReferer: await probeMp4(media.mp4, 'https://apexartworks.vercel.app/'),
    });
  }

  return NextResponse.json({ results }, { headers: { 'cache-control': 'no-store' } });
}
