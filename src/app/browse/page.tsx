import Link from 'next/link';
import { ClipCard } from '@/components/ClipCard';
import { asCategory, countClips, listClips, type SearchResult } from '@/lib/clips';
import { CATEGORY_KEYS } from '@/lib/wall';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;

// Display labels for the fixed category keys (wall.ts CATEGORY_KEYS).
const LABELS: Record<(typeof CATEGORY_KEYS)[number], string> = {
  food: 'Food',
  beverage: 'Beverage',
  venue: 'Venue',
  event: 'Event',
  travel: 'Travel & Places',
  characters: 'Characters & Animals',
  action: 'Action',
  fashion: 'Fashion & Luxury',
  music: 'Music & Dance',
  sport: 'Sport',
  art: 'Art & Craft',
  lifestyle: 'Lifestyle',
  automotive: 'Cars & Motoring',
  nature: 'Nature & Outdoors',
  tech: 'Tech & Devices',
  family: 'Family & Kids',
  heritage: 'Culture & Heritage',
  beauty: 'Beauty & Wellness',
  romance: 'Romance',
  scifi: 'Sci-Fi & Fantasy',
  dining: 'Dining',
};

const pageHref = (page: number, cat?: string) =>
  `/browse?${new URLSearchParams({ ...(cat ? { cat } : {}), ...(page > 1 ? { page: String(page) } : {}) })}`;

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; page?: string }>;
}) {
  const params = await searchParams;
  const category = asCategory(params.cat);
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let clips: SearchResult[] = [];
  let total = 0;
  let libraryDown = false;
  try {
    [clips, total] = await Promise.all([
      listClips(PAGE_SIZE, offset, category),
      countClips(category),
    ]);
  } catch {
    libraryDown = true;
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pb-16 md:px-8">
      <div className="mb-6 mt-10 flex items-baseline justify-between border-b border-hairline pb-4">
        <h1 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
          {category ? LABELS[category] : 'The library'}
        </h1>
        {!libraryDown && (
          <span className="text-[13px] text-txt-muted">
            {total} film{total === 1 ? '' : 's'}
            {pageCount > 1 && ` · page ${page} of ${pageCount}`}
          </span>
        )}
      </div>

      {libraryDown ? (
        <p className="py-16 text-center text-txt-secondary">
          The library is connecting. Try again shortly.
        </p>
      ) : clips.length === 0 ? (
        <p className="py-16 text-center text-txt-secondary">
          Nothing here yet. Try another category.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip) => (
            <ClipCard key={clip.clip_id} clip={clip} />
          ))}
        </div>
      )}

      {/* Numbered pagination — plain links, exhaustive over every page. */}
      {!libraryDown && pageCount > 1 && (
        <nav aria-label="Pages" className="mt-12 flex flex-wrap items-center justify-center gap-2">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) =>
            n === page ? (
              <span
                key={n}
                aria-current="page"
                className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-black"
              >
                {n}
              </span>
            ) : (
              <Link
                key={n}
                href={pageHref(n, category)}
                className="rounded-full border border-hairline px-4 py-1.5 text-[13px] font-medium text-txt-secondary transition-colors hover:border-txt-muted hover:text-txt"
              >
                {n}
              </Link>
            ),
          )}
        </nav>
      )}

      <footer className="mt-24 border-t border-hairline pt-8 text-center text-[13px] text-txt-muted">
        Apex Artworks · Hospitality Film Library
      </footer>
    </main>
  );
}
