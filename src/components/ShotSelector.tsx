'use client';

import { useState } from 'react';
import type { ClientShot } from '@/lib/wall';

/**
 * The shot-selection interaction (Doc 02 §Page 3) — numbered list rows with
 * a ring select control, select-whole-film pill, and the save sheet that
 * POSTs {clip_id, shot_indexes, name?, email?} to /api/selections.
 */
export function ShotSelector({ clipId, shots }: { clipId: string; shots: ClientShot[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setState('idle');
  };

  const allSelected = selected.size === shots.length && shots.length > 0;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(shots.map((s) => s.shot_index)));
    setState('idle');
  };

  const save = async () => {
    setState('saving');
    try {
      const res = await fetch('/api/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clip_id: clipId,
          shot_indexes: [...selected].sort((a, b) => a - b),
          name: name || undefined,
          email: email || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setState('saved');
      setSheetOpen(false);
    } catch {
      setState('error');
    }
  };

  const count = selected.size;
  const countLabel = allSelected ? 'whole film chosen' : count > 0 ? `${count} shot${count === 1 ? '' : 's'} chosen` : '';

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between border-b border-hairline pb-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-txt-muted">The shots</h2>
        <span className="text-[13px] text-txt-muted">select the beats</span>
      </div>

      <ul>
        {shots.map((shot) => {
          const isSelected = selected.has(shot.shot_index);
          return (
            <li key={shot.shot_index} className="border-b border-hairline">
              <button
                onClick={() => toggle(shot.shot_index)}
                aria-pressed={isSelected}
                className={`flex w-full items-start gap-4 px-2 pt-5 text-left transition-colors duration-150 hover:bg-surface-hover ${
                  isSelected ? 'border-l-2 border-white bg-surface' : 'border-l-2 border-transparent'
                }`}
              >
                <span className="w-10 shrink-0 pt-[2px] text-[13px] font-semibold tabular-nums tracking-[0.05em] text-txt-muted">
                  {String(shot.shot_index).padStart(2, '0')}
                </span>
                <span className="flex-1 text-[15px] leading-relaxed text-txt-secondary">
                  {shot.description}
                </span>
                <span
                  aria-hidden="true"
                  className={`mt-1 h-5 w-5 shrink-0 rounded-full border transition-colors ${
                    isSelected ? 'border-white bg-white' : 'border-hairline'
                  }`}
                >
                  {isSelected && (
                    <svg viewBox="0 0 20 20" className="h-full w-full" fill="none" stroke="black" strokeWidth="2.5">
                      <path d="m5.5 10.5 3 3 6-7" />
                    </svg>
                  )}
                </span>
              </button>
              {shot.verbatim_text && (
                <div className="px-2 pb-5 pl-14">
                  <div className="rounded-xl border border-hairline bg-surface p-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
                      Verbatim prompt
                    </p>
                    <p className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-txt-secondary">
                      {shot.verbatim_text}
                    </p>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex flex-col items-center gap-3">
        {state === 'saved' ? (
          <p className="py-4 text-center text-[16px] text-txt">
            Saved — your {allSelected ? 'film' : `${count} chosen beat${count === 1 ? '' : 's'}`}{' '}
            {count === 1 && !allSelected ? 'is' : 'are'} with the Apex team.
          </p>
        ) : sheetOpen ? (
          <div className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-7">
            <p className="text-[15px] text-txt-secondary">
              Leave a name or email so the team knows who chose these. Both optional.
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              aria-label="Your name"
              className="mt-4 w-full rounded-xl border border-hairline bg-black px-4 py-3 text-[15px] text-txt placeholder:text-txt-muted focus:border-txt-muted focus:outline-none"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              aria-label="Your email"
              className="mt-3 w-full rounded-xl border border-hairline bg-black px-4 py-3 text-[15px] text-txt placeholder:text-txt-muted focus:border-txt-muted focus:outline-none"
            />
            <button
              onClick={save}
              disabled={state === 'saving'}
              className="mt-5 w-full rounded-full bg-white py-[16px] text-[16px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {state === 'saving' ? 'Saving…' : 'Save selection'}
            </button>
            {state === 'error' && (
              <p className="mt-3 text-center text-[13px] text-txt-secondary">
                That didn&apos;t save. Check your connection and try again.
              </p>
            )}
          </div>
        ) : (
          <>
            <button
              onClick={count > 0 ? () => setSheetOpen(true) : toggleAll}
              className="w-full max-w-md rounded-full bg-white py-[18px] text-[16px] font-semibold text-black transition-opacity hover:opacity-90"
            >
              {count > 0 ? 'Save selection' : 'Select this film'}
            </button>
            <div className="flex min-h-[20px] items-center gap-3 text-[13px] text-txt-muted">
              {countLabel && <span>{countLabel}</span>}
              {count > 0 && (
                <button onClick={toggleAll} className="underline-offset-2 hover:text-txt-secondary hover:underline">
                  {allSelected ? 'clear all' : 'select whole film'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
