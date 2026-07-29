'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchBar } from './SearchBar';
import { CategoryMenu } from './CategoryMenu';

/**
 * Persistent global header — pinned black bar on every public page (PRD §6:
 * search is the product, always within reach). Carries the search input and,
 * directly beneath it, the category dropdown (Aidan, 2026-07-29: the old
 * horizontal scrolling tab row is gone — one clean bar instead).
 *
 * On the homepage both bars live under the hero (see app/page.tsx), so the
 * header there is just the wordmark. Hidden entirely on the closed /admin
 * surface, which must not show public chrome.
 */

export function GlobalHeader() {
  const pathname = usePathname();

  // The admin viewer is a separate, closed surface — no public chrome.
  if (pathname?.startsWith('/admin')) return null;

  const isHome = pathname === '/';

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
          {!isHome && (
            <div className="min-w-0 flex-1">
              <SearchBar />
            </div>
          )}
        </div>

        {/* The category bar — directly beneath the search bar */}
        {!isHome && (
          <div className="mt-2">
            <CategoryMenu />
          </div>
        )}
      </div>
    </header>
  );
}
