'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchBar } from './SearchBar';

/**
 * Persistent global header — pinned black bar on every public page (PRD §6:
 * search is the product, always within reach). Carries the search input and,
 * directly beneath it, a horizontal row of category tabs. Hidden on the closed
 * /admin surface, which is a separate context and must not show public chrome.
 */

// Categories map to library search terms (there is no category column; the
// two-layer search over title/summary/shot-description is the filter).
const CATEGORIES: { label: string; href: string }[] = [
  { label: 'All', href: '/?view=all#library' },
  { label: 'Food', href: '/search?q=food' },
  { label: 'Beverage', href: '/search?q=drink' },
  { label: 'Venue', href: '/search?q=venue' },
  { label: 'Event', href: '/search?q=event' },
  { label: 'Lifestyle', href: '/search?q=lifestyle' },
];

export function GlobalHeader() {
  const pathname = usePathname();

  // The admin viewer is a separate, closed surface — no public chrome.
  if (pathname?.startsWith('/admin')) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-black/95 backdrop-blur supports-[backdrop-filter]:bg-black/80">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-3 md:px-8">
        <div className="flex items-center gap-3 md:gap-4">
          <Link
            href="/"
            className="shrink-0 text-[15px] font-bold tracking-tight text-txt"
            aria-label="Apex Artworks — home"
          >
            Apex
          </Link>
          <div className="min-w-0 flex-1">
            <SearchBar />
          </div>
        </div>

        {/* Category tabs — a horizontal row directly under the search bar */}
        <nav
          aria-label="Categories"
          className="mt-3 flex items-center gap-1 overflow-x-auto pb-1"
        >
          {CATEGORIES.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="shrink-0 rounded-full border border-hairline px-4 py-1.5 text-[13px] font-medium text-txt-secondary transition-colors hover:border-txt-muted hover:text-txt"
            >
              {c.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
