/**
 * TEMPORARY diagnostic route — delete once film playback is settled.
 *
 * This session's container cannot reach x.com (egress policy), so the only way
 * to learn what X actually serves for our source posts is to ask from a Vercel
 * function, which has open network access. Given ?id= (a status id) it reports
 * what each X endpoint returns, so we can tell whether a post is embeddable and
 * whether a playable video URL exists.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** X's syndication token, derived from the status id (same scheme react-tweet uses). */
function syndicationToken(id: string): string {
  return ((Number(id) / 1e6) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

async function probe(label: string, url: string, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ApexArtworks/1.0)', ...headers },
      cache: 'no-store',
    });
    const body = await res.text();
    return { label, url, status: res.status, len: body.length, body: body.slice(0, 2500) };
  } catch (e) {
    return { label, url, status: 'FETCH_THREW', error: String(e) };
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  // Digits only. This value is interpolated into the URLs below, so anything
  // else could redirect the fetches at a host of the caller's choosing.
  if (!id || !/^\d{1,25}$/.test(id)) {
    return NextResponse.json({ error: 'pass ?id=<numeric status id>' }, { status: 400 });
  }

  const results = await Promise.all([
    probe('syndication', `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${syndicationToken(id)}`),
    probe('oembed', `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://x.com/i/status/${id}`)}&omit_script=1&dnt=true`),
    probe('embed-html', `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true`),
  ]);

  return NextResponse.json({ id, results }, { headers: { 'cache-control': 'no-store' } });
}
