import { ClipCard } from '@/components/ClipCard';
import { searchClips, listClips, type SearchResult } from '@/lib/clips';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;
  const query = q.trim();

  let clips: SearchResult[] = [];
  let libraryDown = false;
  try {
    clips = query ? await searchClips(query) : await listClips(60);
  } catch {
    libraryDown = true;
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pb-16 md:px-8">
      <div className="mb-6 mt-10 flex items-baseline justify-between border-b border-hairline pb-4">
        <h1 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
          {query ? `Results for “${query}”` : 'The library'}
        </h1>
        {!libraryDown && (
          <span className="text-[13px] text-txt-muted">
            {clips.length} film{clips.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {libraryDown ? (
        <p className="py-16 text-center text-txt-secondary">
          The library is connecting. Try again shortly.
        </p>
      ) : clips.length === 0 ? (
        <p className="py-16 text-center text-txt-secondary">
          No films match <em>{query}</em> yet. Try food, drinks, or a venue.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip) => (
            <ClipCard key={clip.clip_id} clip={clip} />
          ))}
        </div>
      )}

      <footer className="mt-24 border-t border-hairline pt-8 text-center text-[13px] text-txt-muted">
        Apex Artworks · hospitality film library
      </footer>
    </main>
  );
}
