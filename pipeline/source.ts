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

export function loadSourceLibrary(csvPath?: string): SourceRow[] {
  const file = csvPath ?? path.join(process.cwd(), 'data', 'apex_source_library.csv');
  const records = parse(fs.readFileSync(file, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];
  return records.map((r) => ({
    video_id: r.video_id,
    source_url: r.source_url,
    verbatim_prompt: r.verbatim_prompt,
    prefilter_flag: r.prefilter_flag ?? '',
    has_timecode: r.has_timecode === 'True' || r.has_timecode === 'true',
  }));
}

export const isJunk = (r: SourceRow) => r.prefilter_flag !== '';
