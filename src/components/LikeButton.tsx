'use client';

import { useSyncExternalStore } from 'react';
import { likesServerSnapshot, likesSnapshot, subscribeLikes, toggleLike } from '@/lib/likes';

/**
 * Like control on a film page.
 *
 * Likes live in localStorage, which the server cannot see, so this reads them
 * through useSyncExternalStore: the server snapshot is empty, the client
 * snapshot is the real list, and React reconciles the difference on hydration
 * without us copying storage into state inside an effect.
 */
export function LikeButton({ clipId }: { clipId: string }) {
  const likes = useSyncExternalStore(subscribeLikes, likesSnapshot, likesServerSnapshot);
  const liked = likes.includes(clipId);

  return (
    <button
      type="button"
      onClick={() => toggleLike(clipId)}
      aria-pressed={liked}
      aria-label={liked ? 'Remove from liked films' : 'Add to liked films'}
      className={`inline-flex items-center gap-2 rounded-full border px-5 py-[14px] text-[15px] font-semibold transition-colors ${
        liked
          ? 'border-transparent bg-white text-black'
          : 'border-hairline text-txt-secondary hover:border-txt-muted hover:text-txt'
      }`}
    >
      <Heart filled={liked} />
      <span>{liked ? 'Liked' : 'Like'}</span>
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M12 20.4 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13z" />
    </svg>
  );
}
