import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center justify-center px-6 py-32 text-center">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-txt-muted">
        Apex Artworks
      </p>
      <h1 className="mt-4 text-[32px] font-bold tracking-[-0.01em]">No film here</h1>
      <p className="mt-3 text-[16px] text-txt-secondary">
        Try the library — food, drinks, or a venue.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-full bg-white px-10 py-[16px] text-[16px] font-semibold text-black transition-opacity hover:opacity-90"
      >
        Back to the library
      </Link>
    </main>
  );
}
