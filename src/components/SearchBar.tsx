'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const PLACEHOLDERS = ['food', 'pasta', 'drone', 'golden hour', 'venue', 'sunset'];

export function SearchBar({ initial = '', autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [phIndex, setPhIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhIndex((i) => (i + 1) % PLACEHOLDERS.length), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/');
      }}
      className="relative w-full"
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-txt-muted"
        width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.8-3.8" />
      </svg>
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Search — ${PLACEHOLDERS[phIndex]}`}
        aria-label="Search the library"
        className="w-full rounded-xl border border-hairline bg-surface py-4 pl-11 pr-4 text-[16px] text-txt placeholder:text-txt-muted transition-colors focus:border-txt-muted focus:outline-none"
      />
    </form>
  );
}

const CHIPS = ['food', 'drinks', 'venue', 'aerial', 'cinematic'];

export function QuickChips({ active }: { active?: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2" role="tablist" aria-label="Browse by category">
      {CHIPS.map((chip) => {
        const isActive = active?.toLowerCase() === chip;
        return (
          <button
            key={chip}
            role="tab"
            aria-selected={isActive}
            onClick={() => router.push(`/search?q=${chip}`)}
            className={`min-h-[44px] text-[14px] transition-colors ${
              isActive
                ? 'border-b-2 border-white font-semibold text-txt'
                : 'text-txt-muted hover:text-txt-secondary'
            }`}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}
