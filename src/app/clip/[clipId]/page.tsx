import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClip, relatedClips } from '@/lib/clips';
import { ShotSelector } from '@/components/ShotSelector';
import { ClipCard } from '@/components/ClipCard';
import { TweetEmbed } from '@/components/TweetEmbed';
import { tweetIdFrom } from '@/lib/tweet';

export const dynamic = 'force-dynamic';

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

  // No video_url assets are hosted yet, so the film plays from its X source
  // in place rather than sending the visitor off-site.
  const tweetId = tweetIdFrom(clip.source_url);

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
          clip.video_url || tweetId ? '' : 'aspect-video'
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
        ) : tweetId ? (
          <TweetEmbed id={tweetId} title={clip.title} />
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
