import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

/**
 * Reader for data/apex_source_library.csv.
 *
 * Only three source fields are ever used: video_id, source_url,
 * verbatim_prompt (+ the two derived flags). Everything else from the
 * original working sheet — their Title, tags, Overall Score, BLB Flag —
 * was discarded upstream and must never re-enter (their score is inversely
 * correlated with our gate; never sort, rank, or filter by it). PRD §1.
 */

export type SourceRow = {
  video_id: string;
  source_url: string;
  verbatim_prompt: string;
  prefilter_flag: string; // '' | 'junk-thin' | 'junk-nourl'
  has_timecode: boolean;
};

/**
 * 44 rows in the sheet had their line breaks written as the two characters
 * backslash-n and never unescaped, so the prompt arrives as one unbroken line.
 * That is a serialization artifact of how the CSV was built, not something its
 * author wrote — and it hides the scene headers and beat markers that the shot
 * splitter reads, so those films decompose badly.
 *
 * Restoring the breaks is deliberately narrow: only when the row has NO real
 * newline at all AND carries more than one escape. A prompt that genuinely
 * mentions a backslash-n while also being properly line-broken is left alone.
 */
const ESCAPED_ONLY = (p: string) => !/\r|\n/.test(p) && (p.match(/\\n/g) ?? []).length > 1;

/**
 * The same rows have their quotes escaped too, so a title reads
 * \"The Scent of Personas\". One pass over the whole escape set, so a
 * sequence is never unescaped twice.
 */
export const restoreEscapes = (p: string): string =>
  ESCAPED_ONLY(p)
    ? p.replace(/\\([nrt"\\])/g, (_, c: string) =>
        c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c,
      )
    : p;

export function loadSourceLibrary(csvPath?: string): SourceRow[] {
  const file = csvPath ?? path.join(process.cwd(), 'data', 'apex_source_library.csv');
  const records = parse(fs.readFileSync(file, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];
  return records.map((r) => ({
    video_id: r.video_id,
    source_url: r.source_url,
    verbatim_prompt: restoreEscapes(r.verbatim_prompt),
    prefilter_flag: r.prefilter_flag ?? '',
    has_timecode: r.has_timecode === 'True' || r.has_timecode === 'true',
  }));
}

export const isJunk = (r: SourceRow) => r.prefilter_flag !== '';
