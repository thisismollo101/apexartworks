import Link from 'next/link';
import { Sunburst } from '@/components/Sunburst';
import { ClipCard } from '@/components/ClipCard';
import { SearchBar } from '@/components/SearchBar';
import { CategoryMenu } from '@/components/CategoryMenu';
import { listClips, type SearchResult } from '@/lib/clips';

export const dynamic = 'force-dynamic';

// The homepage shows a small curated sample by default; "Browse the library"
// (?view=all) loads and displays the entire library inline on this same page.
const SAMPLE_COUNT = 6;
const FULL_LIBRARY_CAP = 2000;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showAll = view === 'all';

  let clips: SearchResult[] = [];
  let libraryDown = false;
  try {
    clips = await listClips(showAll ? FULL_LIBRARY_CAP : SAMPLE_COUNT);
  } catch {
    libraryDown = true;
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pb-16 md:px-8">
      {/* SECTION 1 — sunburst hero: one idea, one action (Doc 04 §1) */}
      <section className="relative flex flex-col items-center pb-16 pt-24 text-center md:pt-32">
        <Sunburst />
        <p className="hero-rise text-[12px] font-semibold uppercase tracking-[0.18em] text-txt-muted">
          Apex Artworks · Library
        </p>
        <h1 className="hero-rise mt-3 text-[40px] font-bold leading-tight tracking-[-0.02em] md:text-[56px]">
          Apex Artworks
        </h1>
        <p className="hero-rise-delayed mt-3 text-[16px] text-txt-secondary md:text-[18px]">
          The Hospitality Film Library
        </p>
        {/* Search + the category bar live directly under the hero on the
            homepage (the global header hides its copies here, so there is
            exactly one of each). */}
        {/* relative z-40 is load-bearing: `hero-rise-delayed` ends on a
            transform, which creates a stacking context — without an explicit
            z-index the category dropdown is trapped inside it and the film
            grid below paints over the open panel. */}
        <div className="hero-rise-delayed relative z-40 mt-10 flex w-full max-w-[560px] flex-col gap-2">
          <SearchBar />
          <CategoryMenu />
        </div>
      </section>

      {/* SECTION 2 — the sample (default) or the full library grid (?view=all) */}
      <section id="library" className="mt-8 scroll-mt-24">
        <div className="mb-6 flex items-baseline justify-between border-b border-hairline pb-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
            {showAll ? 'The library' : 'Sample films'}
          </h2>
          <span className="text-[13px] text-txt-muted">
            {showAll ? `${clips.length} films` : 'search or browse for more'}
          </span>
        </div>

        {libraryDown ? (
          <p className="py-16 text-center text-txt-secondary">
            The library is connecting. Try again shortly.
          </p>
        ) : clips.length === 0 ? (
          <p className="py-16 text-center text-txt-secondary">
            No films yet. The library is being curated — check back soon.
          </p>
        ) : (
          <div
            className={
              showAll
                ? 'grid grid-cols-2 gap-6 md:grid-cols-3'
                // Sample view on mobile: one film per row, and only the first
                // four are shown (the rest appear from md up).
                : 'grid grid-cols-1 gap-6 md:grid-cols-3'
            }
          >
            {clips.map((clip, i) => (
              <div key={clip.clip_id} className={!showAll && i >= 4 ? 'hidden md:block' : undefined}>
                <ClipCard clip={clip} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 4 — one action */}
      <section className="mx-auto mt-24 max-w-[720px] text-center">
        {!showAll && (
          <Link
            href="/browse"
            className="mt-8 inline-block w-full max-w-sm rounded-full bg-white px-8 py-[18px] text-[16px] font-semibold text-black transition-opacity hover:opacity-90"
          >
            Browse the library
          </Link>
        )}
      </section>

      <footer className="mt-24 border-t border-hairline pt-8 text-center text-[13px] text-txt-muted">
        Apex Artworks · Hospitality Film Library
      </footer>
    </main>
  );
}
