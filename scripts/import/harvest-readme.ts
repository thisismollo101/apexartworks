/**
 * Harvest the supplied Seedance collection into our own source shape.
 *
 * Reads the awesome-seedance-2-prompts README, parses every entry, drops the
 * ones we already hold, and writes:
 *
 *   data/apex_source_library_v2.csv   — exactly the SourceRow columns that
 *                                       pipeline/source.ts already reads
 *   data/apex_import_meta_v2.json     — the fields that shape has no room for
 *                                       (title, summary, author, thumbnail,
 *                                       release MP4, publish date)
 *
 * No model is called and no API budget is spent, here or anywhere downstream.
 *
 * Usage:
 *   npx tsx scripts/import/harvest-readme.ts [--file path/to/README.md]
 *
 * With no --file it fetches the current README over https. That is the same
 * document Aidan supplied, read in full rather than as a pasted excerpt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSourceLibrary } from '../../pipeline/source';
import { tweetIdFrom } from '../../src/lib/tweet';
import {
  README_URL,
  VIDEO_URLS_URL,
  countShotMarkers,
  parseReadme,
  type ReadmeEntry,
} from './readme-source';

/**
 * Below this there is no prompt to speak of — mirrors the sheet's 'junk-thin'.
 * Deliberately low: this collection is curated, and a terse one-liner like
 * "A quiet luxury automotive commercial for a classic Mercedes-Benz 190 SL,
 * Kodak film look" is a real, usable prompt, not junk. A stricter cut-off was
 * discarding nine of those.
 */
const MIN_PROMPT_CHARS = 40;

export type ImportMeta = {
  title: string;
  summary: string | null;
  author_name: string | null;
  author_url: string | null;
  thumbnail_url: string | null;
  /** Third-party MP4 on GitHub Releases. We host nothing. */
  video_url: string | null;
  published_at: string | null;
  source_lang: string | null;
};

const csvCell = (v: string) =>
  /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
const csvRow = (cells: string[]) => cells.map(csvCell).join(',');

async function readReadme(): Promise<string> {
  const i = process.argv.indexOf('--file');
  if (i >= 0) return fs.readFileSync(process.argv[i + 1], 'utf8');
  const res = await fetch(README_URL);
  if (!res.ok) throw new Error(`README fetch failed: ${res.status}`);
  return res.text();
}

/** id → direct MP4 on GitHub Releases. Absent ids simply have no hosted file. */
async function readVideoUrls(): Promise<Record<string, string>> {
  try {
    const res = await fetch(VIDEO_URLS_URL);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { prompts?: Record<string, string> };
    return data.prompts ?? {};
  } catch (err) {
    console.log(`  ! video-urls.json unavailable (${err}) — new clips will fall back to their X source`);
    return {};
  }
}

function prefilter(e: ReadmeEntry): string {
  if (!e.source_url) return 'junk-nourl';
  if (e.verbatim_prompt.trim().length < MIN_PROMPT_CHARS) return 'junk-thin';
  return '';
}

async function main() {
  const md = await readReadme();
  const { entries, skipped } = parseReadme(md);
  console.log(`Parsed ${entries.length} entries (${skipped} non-entry headings skipped) from ${md.length} bytes`);

  const withAuthor = entries.filter((e) => e.author_name).length;
  const withSummary = entries.filter((e) => e.summary).length;
  const withSource = entries.filter((e) => e.source_url).length;
  console.log(`  author ${withAuthor}/${entries.length} · summary ${withSummary}/${entries.length} · source link ${withSource}/${entries.length}`);

  // --- Dedupe against what we already hold -------------------------------
  // The gallery id IS our video_id (verified: our row 1402 is their ?id=1402),
  // so the first pass is a plain set difference. The status-id pass catches a
  // prompt that changed id but not X post.
  const existing = loadSourceLibrary();
  const knownIds = new Set(existing.map((r) => r.video_id));
  const knownStatus = new Set(
    existing.map((r) => tweetIdFrom(r.source_url)).filter((s): s is string => !!s),
  );
  // Same prompt reposted under a different URL entirely.
  const norm = (p: string) => p.toLowerCase().replace(/\s+/g, ' ').trim();
  const knownPrompts = new Set(existing.map((r) => norm(r.verbatim_prompt)));

  const fresh: ReadmeEntry[] = [];
  let dupId = 0;
  let dupStatus = 0;
  let dupPrompt = 0;
  for (const e of entries) {
    if (knownIds.has(e.video_id)) dupId++;
    else if (e.status_id && knownStatus.has(e.status_id)) dupStatus++;
    else if (knownPrompts.has(norm(e.verbatim_prompt))) dupPrompt++;
    else fresh.push(e);
  }
  console.log(
    `Dedupe vs ${existing.length} existing rows: ${fresh.length} new, ` +
      `${dupId + dupStatus + dupPrompt} duplicate (${dupId} by id, ${dupStatus} by X status, ${dupPrompt} by prompt)`,
  );

  const junk = fresh.filter((e) => prefilter(e) !== '').length;
  const marked = fresh.filter((e) => countShotMarkers(e.verbatim_prompt) >= 2).length;
  console.log(`  ${junk} flagged junk (no source URL or too thin) · ${marked} carry their own shot markers`);

  // --- Write the source CSV in the existing SourceRow shape --------------
  const videoUrls = await readVideoUrls();
  const lines = ['video_id,source_url,verbatim_prompt,prefilter_flag,has_timecode'];
  const meta: Record<string, ImportMeta> = {};
  for (const e of fresh) {
    lines.push(
      csvRow([
        e.video_id,
        e.source_url ?? '',
        e.verbatim_prompt,
        prefilter(e),
        countShotMarkers(e.verbatim_prompt) >= 2 ? 'True' : 'False',
      ]),
    );
    meta[e.video_id] = {
      title: e.title,
      summary: e.summary,
      author_name: e.author_name,
      author_url: e.author_url,
      thumbnail_url: e.thumbnail_url,
      video_url: videoUrls[e.video_id] ?? null,
      published_at: e.published_at,
      source_lang: e.source_lang,
    };
  }

  const dataDir = path.join(process.cwd(), 'data');
  const csvPath = path.join(dataDir, 'apex_source_library_v2.csv');
  const metaPath = path.join(dataDir, 'apex_import_meta_v2.json');
  fs.writeFileSync(csvPath, `${lines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  const withVideo = Object.values(meta).filter((m) => m.video_url).length;
  console.log(`\nWrote ${csvPath} (${fresh.length} rows)`);
  console.log(`Wrote ${metaPath} — ${withVideo}/${fresh.length} have a hosted MP4 on GitHub Releases`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
