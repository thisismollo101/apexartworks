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

  // The site renders <video src>, and a browser sends a Referer (and, on a
  // cross-origin media load, a Sec-Fetch-Site: cross-site) that a plain
  // server-side fetch does not. If X's CDN gates on those, the server sees 200
  // while every visitor sees a dead player — which is exactly the reported
  // symptom. Probe each header shape separately to find out.
  const BROWSER = {
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    accept: 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
    'accept-language': 'en-US,en;q=0.9',
    range: 'bytes=0-2047',
  };
  const SITE = 'https://apexartworks.vercel.app';

  const cases: { label: string; headers: Record<string, string> }[] = [
    { label: 'no-referer (what the server sent before)', headers: { ...BROWSER } },
    {
      label: 'browser cross-site with referer (what a visitor actually sends)',
      headers: {
        ...BROWSER,
        referer: `${SITE}/clip/APX-C-001`,
        origin: SITE,
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-dest': 'video',
      },
    },
    {
      label: 'referer only',
      headers: { ...BROWSER, referer: `${SITE}/clip/APX-C-001` },
    },
    {
      label: 'sec-fetch headers only',
      headers: { ...BROWSER, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'video' },
    },
  ];

  const probe = async (v: Variant, headers: Record<string, string>) => {
    try {
      const res = await fetch(v.url!, { headers, cache: 'no-store' });
      const head = Buffer.from(await res.arrayBuffer());
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentRange: res.headers.get('content-range'),
        acceptRanges: res.headers.get('accept-ranges'),
        // A valid MP4 opens with a 4-byte size then the ASCII box type 'ftyp'.
        firstBoxIsFtyp: head.subarray(4, 8).toString('ascii') === 'ftyp',
        brand: head.subarray(8, 12).toString('ascii'),
        bytes: head.length,
      };
    } catch (e) {
      return { error: String(e) };
    }
  };

  const results: Record<string, unknown> = {};
  for (const c of cases) results[c.label] = await probe(largest, c.headers);

  return NextResponse.json({
    id,
    variantCount: mp4s.length,
    playedUrl: largest.url,
    results,
    smallest: { url: smallest.url, bitrate: smallest.bitrate },
  });
}
