import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClip } from '@/lib/clips';
import { ShotSelector } from '@/components/ShotSelector';

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

  const meta = [
    clip.runtime_s ? `${clip.runtime_s}s` : null,
    `${shots.length} shot${shots.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="mx-auto w-full max-w-[860px] flex-1 px-6 pb-16 md:px-8">
      <div className="py-6">
        <Link href="/" className="text-[14px] text-txt-muted transition-colors hover:text-txt-secondary">
          ← Back to library
        </Link>
      </div>

      {/* The film, dominant (Doc 04 §4: the product shown in motion) */}
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-hairline bg-surface">
        {clip.video_url ? (
          <video
            src={clip.video_url}
            poster={clip.thumbnail_url ?? undefined}
            controls
            playsInline
            className="h-full w-full object-contain"
          />
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
        <p className="mt-3 text-[13px] tracking-wide text-txt-muted">{meta}</p>

        <ShotSelector clipId={clip.clip_id} shots={shots} />
      </div>

      <footer className="mt-24 border-t border-hairline pt-8 text-center text-[13px] text-txt-muted">
        Apex Artworks · hospitality film library
      </footer>
    </main>
  );
}
