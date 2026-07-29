/**
 * TEMPORARY verification route — delete once playback is confirmed.
 *
 * This session's container cannot reach video.twimg.com (egress policy), so
 * playback cannot be tested here directly. This route runs the two questions
 * that together decide it, from a Vercel function that does have access:
 *
 *   ?id=<status id>            is the MP4 publicly fetchable, and does it look
 *                              like a real MP4? (status, content-type, range
 *                              support, ftyp box)
 *   ?id=<status id>&bytes=1    return the SMALLEST variant base64-encoded, so
 *                              the bytes can be decoded and actually played in
 *                              a real browser locally.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function syndicationToken(id: string): string {
  return ((Number(id) / 1e6) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

type Variant = { bitrate?: number; content_type?: string; url?: string };

async function variantsFor(id: string): Promise<Variant[]> {
  const res = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${syndicationToken(id)}`,
    { headers: { 'user-agent': 'Mozilla/5.0 (compatible; ApexArtworks/1.0)' }, cache: 'no-store' },
  );
  if (!res.ok) return [];
  const json = await res.json();
  const media = json.mediaDetails?.find((m: { type?: string }) => m.type === 'video');
  return (media?.video_info?.variants ?? []).filter(
    (v: Variant) => v.content_type === 'video/mp4' && v.url,
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id || !/^\d{1,25}$/.test(id)) {
    return NextResponse.json({ error: 'pass ?id=<numeric status id>' }, { status: 400 });
  }

  const mp4s = await variantsFor(id);
  if (mp4s.length === 0) return NextResponse.json({ id, error: 'no mp4 variants' }, { status: 404 });

  const sorted = [...mp4s].sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0));
  const smallest = sorted[0];
  const largest = sorted[sorted.length - 1];

  // Return the smallest variant's actual bytes so they can be played locally.
  if (url.searchParams.get('bytes')) {
    const res = await fetch(smallest.url!, {
      // No Referer/Origin on purpose: a browser loading <video src> sends none
      // either, so this is the same request a visitor's browser makes.
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ApexArtworks/1.0)' },
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ error: `mp4 ${res.status}` }, { status: 502 });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3_000_000) {
      return NextResponse.json({ error: 'too large to inline', bytes: buf.length }, { status: 413 });
    }
    return NextResponse.json({
      id,
      url: smallest.url,
      bytes: buf.length,
      contentType: res.headers.get('content-type'),
      base64: buf.toString('base64'),
    });
  }

  // Otherwise report reachability for the variant the site actually plays.
  const probe = async (v: Variant) => {
    try {
      const res = await fetch(v.url!, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; ApexArtworks/1.0)', range: 'bytes=0-2047' },
        cache: 'no-store',
      });
      const head = Buffer.from(await res.arrayBuffer());
      // A valid MP4 opens with a 4-byte size then the ASCII box type 'ftyp'.
      const ftyp = head.subarray(4, 8).toString('ascii');
      return {
        url: v.url,
        bitrate: v.bitrate,
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentRange: res.headers.get('content-range'),
        acceptRanges: res.headers.get('accept-ranges'),
        firstBoxIsFtyp: ftyp === 'ftyp',
        brand: head.subarray(8, 12).toString('ascii'),
      };
    } catch (e) {
      return { url: v.url, error: String(e) };
    }
  };

  return NextResponse.json({
    id,
    variantCount: mp4s.length,
    playedBySite: await probe(largest),
    smallest: { url: smallest.url, bitrate: smallest.bitrate },
  });
}
