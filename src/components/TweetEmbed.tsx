'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Plays a source film inline instead of sending the visitor to X.
 *
 * Every clip's source_url is an x.com status link and no video_url assets are
 * hosted yet, so the film itself lives on X. X's own embed endpoint
 * (platform.twitter.com/embed/Tweet.html) renders the post — video included —
 * inside an iframe, and the video plays in place on our page.
 *
 * This uses the endpoint directly rather than widgets.js, so no third-party
 * script runs on the page. The trade-off is that the iframe cannot size
 * itself, so we listen for the resize message the embed posts and apply the
 * height it asks for.
 */

/** `https://x.com/user/status/123` → `123` (also accepts twitter.com). */
export function tweetIdFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:twitter|x)\.com\/[^/]+\/status(?:es)?\/(\d+)/i.exec(url);
  return m ? m[1] : null;
}

export function TweetEmbed({ id, title }: { id: string; title?: string | null }) {
  const [height, setHeight] = useState(560);
  const [failed, setFailed] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/platform\.twitter\.com$/.test(new URL(e.origin).hostname)) return;
      const data = e.data?.['twttr.embed'];
      const h = data?.params?.[0]?.height ?? data?.params?.[0]?.[id]?.height;
      if (typeof h === 'number' && h > 100) setHeight(Math.ceil(h));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [id]);

  // If X never loads (blocked network, deleted post), fall through to the link.
  useEffect(() => {
    const t = setTimeout(() => {
      if (frameRef.current && height === 560) {
        // still at the default height — the embed likely never reported in
        try {
          if (!frameRef.current.contentWindow) setFailed(true);
        } catch {
          /* cross-origin access throws — that means it DID load */
        }
      }
    }, 6000);
    return () => clearTimeout(t);
  }, [height]);

  if (failed) return null;

  return (
    <iframe
      ref={frameRef}
      // dnt=true keeps X from using the view for ad personalisation
      src={`https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true&hideCard=false&hideThread=true`}
      title={title ? `${title} — source film` : 'Source film'}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      scrolling="no"
      loading="lazy"
      className="w-full border-0"
      style={{ height }}
    />
  );
}
