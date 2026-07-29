'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * The category bar — a single dropdown that sits directly under the search
 * bar. Replaces the old horizontal scrolling tab row (Aidan, 2026-07-29):
 * one clean line, click the arrow, pick a category.
 */

const CATEGORIES: { key: string; label: string }[] = [
  { key: '', label: 'All films' },
  { key: 'food', label: 'Food' },
  { key: 'beverage', label: 'Beverage' },
  { key: 'venue', label: 'Venue' },
  { key: 'event', label: 'Event' },
  { key: 'travel', label: 'Travel & Places' },
  { key: 'characters', label: 'Characters & Animals' },
  { key: 'action', label: 'Action' },
  { key: 'fashion', label: 'Fashion & Luxury' },
  { key: 'music', label: 'Music & Dance' },
  { key: 'sport', label: 'Sport' },
  { key: 'art', label: 'Art & Craft' },
  { key: 'lifestyle', label: 'Lifestyle' },
];

export function CategoryMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Read ?cat= on the client after mount. (Deliberately not useSearchParams:
  // this renders inside the layout, and that hook forces a Suspense boundary
  // on every statically rendered page.)
  useEffect(() => {
    const cat = new URLSearchParams(window.location.search).get('cat') ?? '';
    setActive(pathname === '/browse' ? cat : '');
  }, [pathname]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = CATEGORIES.find((c) => c.key === active) ?? CATEGORIES[0];

  const go = (key: string) => {
    setOpen(false);
    router.push(key ? `/browse?cat=${key}` : '/browse');
  };

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Browse by category"
        className="flex w-full items-center justify-between rounded-xl border border-hairline bg-surface py-4 pl-11 pr-4 text-left text-[16px] text-txt transition-colors hover:border-txt-muted focus:border-txt-muted focus:outline-none"
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-txt-muted"
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        >
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        <span className={active ? 'text-txt' : 'text-txt-muted'}>{current.label}</span>
        <svg
          aria-hidden="true"
          className={`shrink-0 text-txt-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Categories"
          className="absolute left-0 right-0 z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-hairline bg-black/95 p-1 backdrop-blur"
        >
          {CATEGORIES.map((c) => {
            const selected = c.key === active;
            return (
              <li key={c.key || 'all'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => go(c.key)}
                  className={`w-full rounded-lg px-4 py-3 text-left text-[15px] transition-colors hover:bg-surface-hover ${
                    selected ? 'bg-surface font-semibold text-txt' : 'text-txt-secondary'
                  }`}
                >
                  {c.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
