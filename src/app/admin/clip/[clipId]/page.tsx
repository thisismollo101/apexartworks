import Link from 'next/link';
import { notFound } from 'next/navigation';
import { assertAdmin, getAdminClip } from '@/lib/admin';
import { CopyBlock } from '@/components/CopyBlock';

export const dynamic = 'force-dynamic';

/**
 * ADMIN PROMPT VIEWER — server-rendered; the verbatim layer never ships to a
 * non-admin browser because non-admins get the site 404 before any data is
 * read. Linked from no client page. Prompts only: no tags, no gate fields,
 * no cut clips (getAdminClip filters verdict=keep).
 */
export default async function AdminClipPage({
  params,
}: {
  params: Promise<{ clipId: string }>;
}) {
  if (!(await assertAdmin())) notFound();
  const { clipId } = await params;
  const result = await getAdminClip(clipId).catch(() => null);
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
      {/* Unmistakable internal marker (Doc 02) — amber, editorial-only use */}
      <div className="fixed right-4 top-4 z-10 rounded-full border border-hairline bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
        Internal
      </div>

      <div className="py-6">
        <Link href="/admin" className="text-[14px] text-txt-muted transition-colors hover:text-txt-secondary">
          ← Admin
        </Link>
      </div>

      <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] md:text-[32px]">
        {clip.title}
      </h1>
      {clip.summary && (
        <p className="mt-3 text-[16px] leading-relaxed text-txt-secondary">{clip.summary}</p>
      )}
      <p className="mt-3 text-[13px] tracking-wide text-txt-muted">{meta}</p>

      <div className="mt-8">
        {clip.verbatim_prompt ? (
          <CopyBlock text={clip.verbatim_prompt} label="Verbatim prompt · internal" />
        ) : (
          <p className="rounded-2xl border border-hairline bg-surface p-6 text-[14px] text-txt-muted">
            No clip-level source prompt on this row (demo seeds carry per-shot verbatim only).
          </p>
        )}
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between border-b border-hairline pb-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
            The shots
          </h2>
          <span className="text-[13px] text-txt-muted">with verbatim segments</span>
        </div>
        <ul>
          {shots.map((shot) => (
            <li key={shot.shot_index} className="border-b border-hairline px-2 py-5">
              <div className="flex items-start gap-4">
                <span className="w-10 shrink-0 pt-[2px] text-[13px] font-semibold tabular-nums tracking-[0.05em] text-txt-muted">
                  {String(shot.shot_index).padStart(2, '0')}
                </span>
                <div className="flex-1">
                  <p className="text-[15px] leading-relaxed text-txt-secondary">{shot.description}</p>
                  {shot.verbatim_text && (
                    <div className="mt-3 rounded-xl border border-hairline bg-surface p-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
                        Verbatim · internal
                      </p>
                      <p className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-txt-secondary">
                        {shot.verbatim_text}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
