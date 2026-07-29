import 'server-only';

/**
 * Resolves the playable film behind an X source post.
 *
 * No video assets are self-hosted. Every clip's source is an x.com post, and
 * X's syndication endpoint — the same one its own embeds use — hands back the
 * post's media, including direct MP4 URLs on video.twimg.com. We read that
 * server-side and play the MP4 in a native <video>, so the film plays in place
 * with our own player and no third-party iframe or script on the page. The
 * bytes still stream from X's CDN; we only ever hold the URL.
 *
 * Verified against the live endpoint (2026-07-29): a source post returns
 * `mediaDetails[].video_info.variants` with 480x270 / 640x360 / 1280x720 MP4s
 * plus an HLS playlist, and a poster frame on pbs.twimg.com.
 */

export type TweetMedia = {
  /** Highest-bitrate progressive MP4 — what the <video> element plays. */
  mp4: string;
  /** Poster frame, shown before playback starts. */
  poster: string | null;
  /** [w, h] — used to reserve the right box so the page does not jump. */
  aspect: [number, number];
  durationMs: number | null;
};

/** X's syndication token, derived from the status id (the scheme X's embeds use). */
function syndicationToken(id: string): string {
  return ((Number(id) / 1e6) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

type Variant = { bitrate?: number; content_type?: string; url?: string };
type MediaDetail = {
  type?: string;
  media_url_https?: string;
  ext_media_availability?: { status?: string };
  video_info?: { aspect_ratio?: [number, number]; duration_millis?: number; variants?: Variant[] };
};

/**
 * Fetch the media for a status id, or null when there is nothing playable —
 * a deleted or protected post, an image-only post, or X being unreachable.
 * Callers fall back to the embed and then to the plain source link.
 */
export async function getTweetMedia(id: string): Promise<TweetMedia | null> {
  if (!/^\d{1,25}$/.test(id)) return null;

  const url =
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${syndicationToken(id)}`;

  let json: { mediaDetails?: MediaDetail[] };
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ApexArtworks/1.0)' },
      // The post is immutable once published; cache hard so a busy page does
      // not hammer X, and a slow response never blocks a later visitor.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  const video = json.mediaDetails?.find(
    (m) => m.type === 'video' && m.ext_media_availability?.status === 'Available',
  );
  if (!video?.video_info?.variants) return null;

  // Progressive MP4 only — an <video> element cannot play the HLS variant
  // natively outside Safari. Take the highest bitrate on offer.
  const best = video.video_info.variants
    .filter((v) => v.content_type === 'video/mp4' && v.url)
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
  if (!best?.url) return null;

  return {
    mp4: best.url,
    poster: video.media_url_https ?? null,
    aspect: video.video_info.aspect_ratio ?? [16, 9],
    durationMs: video.video_info.duration_millis ?? null,
  };
}
