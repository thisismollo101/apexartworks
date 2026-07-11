'use client';

import { useState } from 'react';

export function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-muted">
          {label}
        </span>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="min-h-[32px] rounded-full border border-hairline px-4 text-[12px] text-txt-secondary transition-colors hover:bg-surface-hover"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-txt-secondary">
        {text}
      </pre>
    </div>
  );
}
