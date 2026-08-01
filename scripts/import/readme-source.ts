/**
 * Parser for the awesome-seedance-2-prompts README.
 *
 * The collection Aidan supplied is the auto-generated README of the public repo
 * YouMind-OpenLab/awesome-seedance-2-prompts (CC BY 4.0). It is generated from
 * the same YouMind gallery our own data/apex_source_library.csv came from — our
 * row video_id 1402 is the same X post as their gallery ?id=1402 — so the
 * gallery id IS our video_id and no id remapping is needed.
 *
 * Every field the import needs is already in the markdown: title, a one-line
 * description, the full prompt, a thumbnail, the X source link, the author's
 * name and handle, and a publish date. Nothing is inferred, so nothing needs a
 * model. That matters: this import runs on a zero API budget.
 *
 * Their own ordering, "featured" flag and gallery ranking are read but never
 * used to sort, rank or filter — same rule PRD §1 sets for the original sheet.
 */
import { tweetIdFrom } from '../../src/lib/tweet';

export type ReadmeEntry = {
  /** Gallery id — the same namespace as our video_id. */
  video_id: string;
  title: string;
  /** The one-line blurb the README already carries; becomes clips.summary. */
  summary: string | null;
  verbatim_prompt: string;
  source_url: string | null;
  /** X status id parsed out of source_url, for dedupe against the live library. */
  status_id: string | null;
  author_name: string | null;
  author_url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  /** Language badge on the entry — the language of the ORIGINAL post, not of
   *  the prompt text below it, which the README has already translated. */
  source_lang: string | null;
  featured: boolean;
};

/** The repo the collection lives in, for the licence credit. */
export const COLLECTION = {
  name: 'awesome-seedance-2-prompts',
  owner: 'YouMind-OpenLab',
  url: 'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const;

const RAW = `https://raw.githubusercontent.com/${COLLECTION.owner}/${COLLECTION.name}/main`;

export const README_URL = `${RAW}/README.md`;
/** id → direct MP4 on GitHub Releases (1000 entries at time of writing). */
export const VIDEO_URLS_URL = `${RAW}/video-urls.json`;

/**
 * Markers a prompt uses to structure itself into shots: "[00:00-00:05]",
 * "0-4 seconds:", "0:00–0:02", "Shot 3", "Scene 2", "(0-2s)". Shared with the
 * shot splitter so has_timecode and the actual split can never disagree.
 */
export const SHOT_MARKER =
  /(\[?\d{1,2}[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}\]?|\(?\b\d{1,2}(?:\.\d)?\s*[-–—]\s*\d{1,2}(?:\.\d)?\s*(?:seconds?|secs?|s)\b\)?|\bShot\s*\d+|\bScene\s*\d+|\bPart\s*\d+\s*\()/gi;

export function countShotMarkers(prompt: string): number {
  return (prompt.match(SHOT_MARKER) ?? []).length;
}

/** Featured entries are titled "No. 3: Real Title" — the rank is theirs, not ours. */
const stripRank = (t: string) => t.replace(/^No\.\s*\d+:\s*/, '').trim();

function firstMatch(block: string, re: RegExp): string | null {
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

/**
 * Split the README into per-entry blocks.
 *
 * Entries are `### ` headings. A prompt could in principle contain a line
 * starting with "### " inside its fenced block, which would split one entry in
 * two — so fenced blocks are blanked out before locating the headings, and the
 * offsets are then applied to the original text.
 */
function splitBlocks(md: string): string[] {
  const masked = md.replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length));
  const starts: number[] = [];
  const re = /^### /gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) starts.push(m.index);
  return starts.map((s, i) => md.slice(s + 4, starts[i + 1] ?? md.length));
}

export function parseReadme(md: string): { entries: ReadmeEntry[]; skipped: number } {
  const entries: ReadmeEntry[] = [];
  let skipped = 0;

  for (const block of splitBlocks(md)) {
    const title = stripRank(block.split('\n', 1)[0]);

    // The prompt is the first fenced block in the entry.
    const prompt = firstMatch(block, /```\n([\s\S]*?)\n```/);
    // The gallery link carries the id; it is the only reliable one — the
    // release-video filename is absent for entries with no downloaded video.
    const id = firstMatch(block, /seedance-2-0-prompts\?id=(\d+)/);
    if (!prompt || !id) {
      // A heading with no prompt or no gallery link is section furniture
      // ("How to Contribute", "Star History"), not an entry.
      skipped++;
      continue;
    }

    const sourceUrl = firstMatch(block, /(https:\/\/x\.com\/[^/\s)]+\/status\/\d+)/);
    // Two layouts: featured entries use a bulleted "- **Author:**", the rest a
    // single inline "**Author:** … | **Source:** … | **Published:** …" line.
    const author = /\*\*Author:\*\*\s*\[([^\]]+)\]\((https:\/\/x\.com\/[^)\s]+)\)/.exec(block);

    entries.push({
      video_id: id,
      title,
      summary:
        firstMatch(block, /####\s*[^\n]*Description\s*\n+([^\n]+)/) ??
        firstMatch(block, /\n>\s+([^\n]+)/),
      verbatim_prompt: prompt,
      source_url: sourceUrl,
      status_id: sourceUrl ? tweetIdFrom(sourceUrl) : null,
      author_name: author ? author[1].trim() : null,
      author_url: author ? author[2].trim() : null,
      thumbnail_url: firstMatch(block, /<img\s+src="([^"]+)"/),
      published_at: firstMatch(block, /\*\*Published:\*\*\s*([^\n|*]+)/),
      source_lang: firstMatch(block, /!\[([^\]]+)\]\(https:\/\/img\.shields\.io\/badge\/lang-/),
      featured: /!\[Featured\]/.test(block),
    });
  }

  // The featured entries at the top of the README are repeated in the main
  // list further down. Keep the first sighting of each id.
  const seen = new Set<string>();
  const unique = entries.filter((e) => (seen.has(e.video_id) ? false : (seen.add(e.video_id), true)));
  return { entries: unique, skipped };
}
