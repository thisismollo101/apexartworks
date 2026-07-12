'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SearchBar } from './SearchBar';

/**
 * Persistent global header — pinned black bar on every public page (PRD §6:
 * search is the product, always within reach). Carries the search input and
 * the category dropdown. Hidden on the closed /admin surface, which is a
 * separate context and must not show the public library chrome.
 */

// Categories map to library search terms (there is no category column; the
// two-layer search over title/summary/shot-description is the filter).
const CATEGORIES: { label: string; q: string }[] = [
  { label: 'Food', q: 'food' },
  { label: 'Beverage', q: 'drink' },
  { label: 'Venue', q: 'venue' },
  { label: 'Event', q: 'event' },
  { label: 'Lifestyle', q: 'lifestyle' },
];

export function GlobalHeader() {
  const pathname = usePathname();
  const router = useRouter();

  // The admin viewer is a separate, closed surface — no public chrome.
  if (pathname?.startsWith('/admin')) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-black/95 backdrop-blur supports-[backdrop-filter]:bg-black/80">
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-6 py-3 md:gap-4 md:px-8">
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

        <label className="sr-only" htmlFor="category-filter">
          Filter by category
        </label>
        <select
          id="category-filter"
          defaultValue=""
          onChange={(e) => {
            const cat = CATEGORIES.find((c) => c.label === e.target.value);
            if (cat) router.push(`/search?q=${encodeURIComponent(cat.q)}`);
          }}
          className="shrink-0 rounded-xl border border-hairline bg-surface px-3 py-4 text-[14px] text-txt-secondary transition-colors focus:border-txt-muted focus:outline-none"
        >
          <option value="" disabled>
            Categories
          </option>
          {CATEGORIES.map((c) => (
            <option key={c.label} value={c.label}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
