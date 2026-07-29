/**
 * Source-film helpers shared by server and client.
 *
 * This deliberately lives outside `components/TweetEmbed.tsx`: that file is a
 * `'use client'` module, and a server component cannot call a function exported
 * from one — it may only render it as a component. The clip page resolves the
 * id on the server, so the helper has to sit in a neutral module like this one.
 */

/** `https://x.com/user/status/123` → `123` (also accepts twitter.com). */
export function tweetIdFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:twitter|x)\.com\/[^/]+\/status(?:es)?\/(\d+)/i.exec(url);
  return m ? m[1] : null;
}
