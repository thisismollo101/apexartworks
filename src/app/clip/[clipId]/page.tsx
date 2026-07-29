import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClip, relatedClips } from '@/lib/clips';
import { ShotSelector } from '@/components/ShotSelector';
import { ClipCard } from '@/components/ClipCard';
import { tweetIdFrom } from '@/lib/tweet';
import { getTweetMedia } from '@/lib/tweetMedia';
import { LikeButton } from '@/components/LikeButton';
import { CopyBlock } from '@/components/CopyBlock';

export const dynamic = 'force-dynamic';

/**
 * The film is served from X's CDN, which hotlink-protects on Referer: a
 * request carrying one gets 403, the identical request without one gets the
 * video. Chrome sends `Referer: <our origin>` by default on a cross-origin
 * media load, so every <video> on this page failed to load while the same URL
 * fetched fine server-side (verified 2026-07-29 — 403 with Referer, 206
 * without). Media elements have no referrerpolicy attribute, so the policy has
 * to be set for the document, which covers the video request.
 */
export const metadata = { referrer: 'no-referrer' as const };

export default async function ClipPage({
  params,
}: {
  params: Promise<{ clipId: string }>;
}) {
  const { clipId } = await params;
  // Cuts and unknown ids are identical to the client: not found.
  const result = await getClip(clipId).catch(() => null);
  if (!result) notFound();
  const { clip, shots } = result;
  const related = await relatedClips(clipId, 3).catch(() => []);

  const meta = [
    clip.runtime_s ? `${clip.runtime_s}s` : null,
    `${shots.length} shot${shots.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  // No video assets are self-hosted, so the film plays from its X source in
  // place rather than sending the visitor off-site: a hosted asset if one ever
  // exists, else the source post's own MP4 played in our player.
  //
  // When neither resolves the post is gone from X — deleted, or the account
  // went protected — which is true of 74 of the 766 films. Those fall through
  // to the source link rather than X's embed: the embed is only a script
  // shell, and for exactly these posts it would render an empty broken frame.
  const tweetId = tweetIdFrom(clip.source_url);
  const media = clip.video_url || !tweetId ? null : await getTweetMedia(tweetId);

  return (
    <main className="mx-auto w-full max-w-[860px] flex-1 px-6 pb-16 md:px-8">
      <div className="py-6">
        <Link href="/" className="text-[14px] text-txt-muted transition-colors hover:text-txt-secondary">
          ← Back to library
        </Link>
      </div>

      {/* The film, dominant (Doc 04 §4: the product shown in motion) */}
      <div
        className={`relative overflow-hidden rounded-2xl border border-hairline bg-surface ${
          clip.video_url || media ? '' : 'aspect-video'
        }`}
      >
        {clip.video_url ? (
          <video
            src={clip.video_url}
            poster={clip.thumbnail_url ?? undefined}
            controls
            playsInline
            className="aspect-video h-full w-full object-contain"
          />
        ) : media ? (
          <video
            src={media.mp4}
            poster={media.poster ?? clip.thumbnail_url ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="w-full bg-black"
            style={{ aspectRatio: `${media.aspect[0]} / ${media.aspect[1]}` }}
          />
        ) : clip.source_url ? (
          <a
            href={clip.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-full w-full flex-col items-center justify-center gap-3 transition-colors hover:bg-surface-hover"
          >
            <svg width="52" height="52" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="19" fill="none" stroke="#3A3A3D" strokeWidth="1" />
              <path d="M16.5 13.5v13l11-6.5z" fill="rgba(255,255,255,0.72)" />
            </svg>
            <p className="text-[14px] font-semibold text-txt">Watch the film ↗</p>
            <p className="max-w-[80%] truncate text-[12px] text-txt-muted">{clip.source_url}</p>
          </a>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <svg width="52" height="52" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="19" fill="none" stroke="#1E1E20" strokeWidth="1" />
              <path d="M16.5 13.5v13l11-6.5z" fill="rgba(255,255,255,0.32)" />
            </svg>
            <p className="text-[13px] text-txt-muted">Film coming online</p>
          </div>
        )}
      </div>

      <div className="mx-auto mt-10 max-w-[720px]">
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] md:text-[32px]">
          {clip.title}
        </h1>
        {clip.summary && (
          <p className="mt-3 text-[16px] leading-relaxed text-txt-secondary">{clip.summary}</p>
        )}
        <p className="mt-3 text-[13px] tracking-wide text-txt-muted">
          {meta}
          {clip.source_url && (
            <>
              {' · '}
              <a
                href={clip.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-hairline underline-offset-4 transition-colors hover:text-txt-secondary"
              >
                open on X ↗
              </a>
            </>
          )}
        </p>

        <div className="mt-5">
          <LikeButton clipId={clip.clip_id} />
        </div>

        {shots.length > 0 ? (
          <ShotSelector clipId={clip.clip_id} shots={shots} />
        ) : (
          <section className="mt-12">
            <div className="flex items-baseline justify-between border-b border-hairline pb-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
                The shots
              </h2>
            </div>
            <p className="py-10 text-center text-[15px] text-txt-secondary">
              The beats for this film are coming online. Check back shortly.
            </p>
          </section>
        )}

        {/* The same prompt again, whole and in one piece.
            The per-shot boxes above are the breakdown; this is the prompt as
            it was originally written — scene headers and the trailing global
            direction (style, feel, audio) that belongs to no single shot — so
            it can be copied straight out in one go. */}
        {clip.verbatim_prompt && (
          <section className="mt-14">
            <div className="mb-4 flex items-baseline justify-between border-b border-hairline pb-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
                Full prompt
              </h2>
              <span className="text-[13px] text-txt-muted">every scene, in one block</span>
            </div>
            <CopyBlock text={clip.verbatim_prompt} label="Verbatim — complete" />
          </section>
        )}
      </div>

      {/* Related clips — three more films from the library, in one row */}
      {related.length > 0 && (
        <section className="mx-auto mt-24 max-w-[1100px]">
          <div className="mb-6 flex items-baseline justify-between border-b border-hairline pb-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
              Related clips
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {related.slice(0, 3).map((rc) => (
              <ClipCard key={rc.clip_id} clip={rc} />
            ))}
          </div>
        </section>
      )}

      <footer className="mt-24 border-t border-hairline pt-8 text-center text-[13px] text-txt-muted">
        Apex Artworks · Hospitality Film Library
      </footer>
    </main>
  );
}
