'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ClipCard } from '@/components/ClipCard';
import { likesServerSnapshot, likesSnapshot, subscribeLikes } from '@/lib/likes';
import type { SearchResult } from '@/lib/clips';

/**
 * The visitor's liked films.
 *
 * Client-rendered because the likes themselves live in localStorage — the
 * server has no idea what this browser liked. The ids go to /api/clips?ids=,
 * which resolves them through client_clips, so the wall holds exactly as it
 * does everywhere else and a cut film simply drops out of the list.
 */
export default function LikedPage() {
  const likes = useSyncExternalStore(subscribeLikes, likesSnapshot, likesServerSnapshot);
  const key = likes.join(',');

  // Keyed by the id list the result belongs to, so a stale response from a
  // previous list is never shown against the current one.
  const [result, setResult] = useState<{ key: string; clips: SearchResult[]; failed: boolean }>();

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/clips?ids=${encodeURIComponent(key)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setResult({ key, clips: data.clips ?? [], failed: false });
      } catch {
        if (!cancelled) setResult({ key, clips: [], failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = result?.key === key ? result : undefined;
  const status = !key ? 'empty' : !current ? 'loading' : current.failed ? 'error' : 'ready';
  const clips = current?.clips ?? [];

  return (
    <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 pb-16 md:px-8">
      <div className="mb-6 flex items-baseline justify-between border-b border-hairline pb-4 pt-8">
        <h1 className="text-[26px] font-bold tracking-[-0.01em] md:text-[32px]">Liked Films</h1>
        {status === 'ready' && clips.length > 0 && (
          <span className="text-[13px] text-txt-muted">
            {clips.length} film{clips.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {status === 'loading' && (
        <p className="py-16 text-center text-[15px] text-txt-muted">Loading…</p>
      )}

      {status === 'error' && (
        <p className="py-16 text-center text-[15px] text-txt-muted">
          Could not load your liked films just now. Reload to try again.
        </p>
      )}

      {(status === 'empty' || (status === 'ready' && clips.length === 0)) && (
        <div className="flex flex-col items-center py-24 text-center">
          <p className="text-[18px] font-semibold text-txt">No liked films yet</p>
          <p className="mt-3 max-w-[420px] text-[15px] leading-relaxed text-txt-secondary">
            Open any film and press Like. It will collect here, on this browser.
          </p>
          <Link
            href="/browse"
            className="mt-8 inline-block rounded-full bg-white px-10 py-[16px] text-[16px] font-semibold text-black transition-opacity hover:opacity-90"
          >
            Browse the library
          </Link>
        </div>
      )}

      {status === 'ready' && clips.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip) => (
            <ClipCard key={clip.clip_id} clip={clip} />
          ))}
        </div>
      )}

      <footer className="mt-24 border-t border-hairline pt-8 text-center text-[13px] text-txt-muted">
        Apex Artworks · Hospitality Film Library
      </footer>
    </main>
  );
}
