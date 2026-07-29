import Link from 'next/link';
import type { SearchResult } from '@/lib/clips';

/**
 * Posters come from X's image CDN, which serves sized variants off the same
 * URL. A browse page shows 60 cards, so ask for the small one rather than the
 * full frame. Anything not on pbs.twimg.com (a self-hosted thumbnail later) is
 * left exactly as it is.
 */
function posterFor(url: string): string {
  if (!url.startsWith('https://pbs.twimg.com/') || url.includes('?')) return url;
  return `${url}?name=small`;
}

const meta = (c: SearchResult) =>
  [c.runtime_s ? `${c.runtime_s}s` : null, c.shot_count ? `${c.shot_count} shot${c.shot_count === 1 ? '' : 's'}` : null]
    .filter(Boolean)
    .join(' · ');

export function ClipCard({ clip }: { clip: SearchResult }) {
  return (
    <Link
      href={`/clip/${clip.clip_id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-hairline bg-surface transition-colors duration-150 hover:bg-surface-hover"
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        {clip.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterFor(clip.thumbnail_url)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlayMark />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[17px] font-bold leading-snug text-txt">{clip.title}</h3>
        {/* Full summary, not truncated — the card should say what the film is
            about without a click through (Aidan, 2026-07-29). */}
        {clip.summary && (
          <p className="mt-2 text-[14px] leading-relaxed text-txt-secondary">{clip.summary}</p>
        )}
        {/* mt-auto keeps the runtime line on the baseline of every card in a row */}
        <p className="mt-auto pt-3 text-[12px] tracking-wide text-txt-muted">
          {meta(clip)}
          {clip.match_hint && <span className="ml-2 border-l border-hairline pl-2">{clip.match_hint}</span>}
        </p>
      </div>
    </Link>
  );
}

function PlayMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="none" stroke="#1E1E20" strokeWidth="1" />
      <path d="M16.5 13.5v13l11-6.5z" fill="rgba(255,255,255,0.32)" />
    </svg>
  );
}
