/** Reading the status id out of a source post's URL. */

/** `https://x.com/user/status/123` → `123` (also accepts twitter.com). */
export function tweetIdFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:twitter|x)\.com\/[^/]+\/status(?:es)?\/(\d+)/i.exec(url);
  return m ? m[1] : null;
}
