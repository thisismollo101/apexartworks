/**
 * The signature element (Doc 01 §5): a fine-line radiating burst behind the
 * page title. Appears once per page, draws in on load, never loops.
 * Decorative only — aria-hidden; reduced-motion renders it static (CSS).
 */
export function Sunburst({ compact = false }: { compact?: boolean }) {
  const rays = 96;
  const cx = 300;
  const cy = 150;
  const lines = Array.from({ length: rays }, (_, i) => {
    const angle = (i / rays) * Math.PI * 2;
    // longest at the horizontal axis, shortest vertical (Doc 01 §5)
    const len = 60 + 90 * Math.abs(Math.cos(angle)) ** 1.5;
    const inner = 52;
    return {
      x1: cx + Math.cos(angle) * inner,
      y1: cy + Math.sin(angle) * inner * 0.62,
      x2: cx + Math.cos(angle) * (inner + len),
      y2: cy + Math.sin(angle) * (inner + len) * 0.62,
    };
  });
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 600 300"
      className={`sunburst pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${
        compact ? 'w-40' : 'w-[36rem] max-w-[92vw]'
      }`}
    >
      <defs>
        <radialGradient id="rayfade" cx="50%" cy="50%" r="50%">
          <stop offset="35%" stopColor="rgba(255,255,255,0.28)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      {lines.map((l, i) => (
        <line key={i} {...l} stroke="url(#rayfade)" strokeWidth="0.7" />
      ))}
    </svg>
  );
}
