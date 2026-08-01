/**
 * Apply the real-world rule to the harvested collection.
 *
 * Reads data/apex_source_library_v2.csv + data/apex_import_meta_v2.json,
 * runs pipeline/realworld-rules.ts over every row, and writes:
 *
 *   out/import_gate.jsonl    — one verdict per row, with its evidence
 *   out/import_review.csv    — only the undecided rows, for a human pass
 *   out/import_floor.csv     — floor cuts, BY video_id ONLY (PRD §2 FLOOR)
 *
 * Nothing here calls a model. Review rows are NOT loaded unless their id is
 * listed in out/import_decisions.csv — default-deny, the same posture
 * pipeline/ingest.ts takes with out/library_selection.json.
 *
 * Usage: npx tsx scripts/import/classify.ts [--verbose]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSourceLibrary } from '../../pipeline/source';
import { gate, type RealWorldVerdict } from '../../pipeline/realworld-rules';
import type { ImportMeta } from './harvest-readme';

export const OUT = path.join(process.cwd(), 'out');
export const SOURCE_V2 = path.join(process.cwd(), 'data', 'apex_source_library_v2.csv');
export const META_V2 = path.join(process.cwd(), 'data', 'apex_import_meta_v2.json');

export type GateRecord = RealWorldVerdict & { video_id: string; title: string };

export const loadMeta = (): Record<string, ImportMeta> =>
  JSON.parse(fs.readFileSync(META_V2, 'utf8')) as Record<string, ImportMeta>;

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csvRow = (cells: string[]) => cells.map(csvCell).join(',');

export function classifyAll(): GateRecord[] {
  const rows = loadSourceLibrary(SOURCE_V2);
  const meta = loadMeta();
  return rows.map((r) => {
    const m = meta[r.video_id];
    return {
      video_id: r.video_id,
      title: m?.title ?? '',
      ...gate({ title: m?.title ?? '', summary: m?.summary ?? null, verbatim_prompt: r.verbatim_prompt }),
    };
  });
}

function main() {
  const verbose = process.argv.includes('--verbose');
  const rows = loadSourceLibrary(SOURCE_V2);
  const byId = new Map(rows.map((r) => [r.video_id, r]));
  const results = classifyAll();

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, 'import_gate.jsonl'),
    `${results.map((r) => JSON.stringify(r)).join('\n')}\n`,
    'utf8',
  );

  // The floor log records the id and nothing else — never the prompt, never
  // the URL. Same rule as pipeline/ingest.ts.
  const floor = results.filter((r) => r.cut_reason === 'floor-child-safety');
  fs.writeFileSync(
    path.join(OUT, 'import_floor.csv'),
    `video_id\n${floor.map((r) => r.video_id).join('\n')}\n`,
    'utf8',
  );

  const review = results.filter((r) => r.verdict === 'review');
  fs.writeFileSync(
    path.join(OUT, 'import_review.csv'),
    [
      'video_id,title,score,why,excerpt',
      ...review.map((r) =>
        csvRow([
          r.video_id,
          r.title,
          String(r.score),
          r.note,
          (byId.get(r.video_id)?.verbatim_prompt ?? '').replace(/\s+/g, ' ').slice(0, 300),
        ]),
      ),
    ].join('\n') + '\n',
    'utf8',
  );

  const n = (v: string) => results.filter((r) => r.verdict === v).length;
  console.log(`${results.length} rows: ${n('keep')} keep · ${n('cut')} cut · ${n('review')} review`);
  const reasons = new Map<string, number>();
  for (const r of results.filter((x) => x.verdict === 'cut')) {
    reasons.set(r.cut_reason, (reasons.get(r.cut_reason) ?? 0) + 1);
  }
  for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  cut ${k}: ${v}`);
  console.log(`\nout/import_review.csv — ${review.length} rows need a human call`);

  if (verbose) {
    for (const v of ['keep', 'cut', 'review'] as const) {
      console.log(`\n===== ${v.toUpperCase()} =====`);
      for (const r of results.filter((x) => x.verdict === v)) {
        console.log(`  ${r.video_id}  ${r.title.slice(0, 52).padEnd(52)}  ${r.note.slice(0, 60)}`);
      }
    }
  }
}

if (process.argv[1]?.endsWith('classify.ts')) main();
