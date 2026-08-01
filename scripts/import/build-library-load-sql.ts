/**
 * Load the REST of the library — the prompts we were given and never loaded.
 *
 * data/apex_source_library.csv holds 3,552 rows (3,415 clean). Only 766 of
 * them were ever loaded, because the original ingest asked a model to gate
 * each clip and to write its title and summary, and that run stopped when the
 * budget did. Nothing about the remaining rows needs a model:
 *
 *   gate      → pipeline/realworld-rules.ts   (deterministic)
 *   shots     → pipeline/offline-decompose.ts (parses the prompt's own beats)
 *   headline  → pipeline/offline-headline.ts  (derived from the prompt text)
 *
 * ATTRIBUTION. These rows have no author column, but every single one carries
 * an X source_url, and the handle in it IS the person who posted the prompt —
 * 922 distinct authors across the library. That is a fact we can read off the
 * URL, so it is recorded. `license` is deliberately left NULL: the CC BY 4.0
 * claim belongs to the awesome-seedance collection, and we cannot show these
 * rows are in it, so asserting a licence for them would be inventing one.
 *
 * REVIEW rows are not loaded (PRD §2: undecided is not a keep). Rows whose
 * prompt is nothing but direction to the generator — no film described, so no
 * title derivable — are dropped too rather than loaded as "Untitled Film".
 *
 * Emits chunked SQL under out/, because one statement holding every clip and
 * shot is far too large to send in a single round trip.
 *
 * Usage: npx tsx scripts/import/build-library-load-sql.ts [--chunk 60]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSourceLibrary } from '../../pipeline/source';
import { offlineDecompose } from '../../pipeline/offline-decompose';
import { deriveHeadline } from '../../pipeline/offline-headline';
import { gate } from '../../pipeline/realworld-rules';
import { OUT } from './classify';

const q = (v: string | number | null): string => {
  if (v === null || v === '') return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  return `'${v.replace(/'/g, "''")}'`;
};
const qTag = (v: string) => (v === 'none' || !v ? 'null' : q(v));

/** The poster's X handle — the only attribution this CSV can support. */
function authorFrom(sourceUrl: string): { name: string | null; url: string | null } {
  const m = sourceUrl.match(/(?:x|twitter)\.com\/([^/?#]+)\/status/i);
  if (!m || !m[1] || m[1].toLowerCase() === 'i') return { name: null, url: null };
  return { name: `@${m[1]}`, url: `https://x.com/${m[1]}` };
}

const CLIP_COLS = `clip_id, video_id, title, summary, runtime_s, aspect_ratio, source_url,
  verbatim_prompt, video_url, thumbnail_url, asset_status, shot_count, verdict,
  step1_grounded_brand_safe, home_route, realism_level, grade, motion_feel,
  ip_flags, gate_confidence, gate_notes, generator, author_name, author_url,
  license, license_url`;

/**
 * DO NOTHING, not DO UPDATE. The 766 clips already loaded have titles and
 * summaries a model wrote, which read far better than anything derived here.
 * An upsert would silently overwrite every one of them with a plainer derived
 * line. Making the conflict a no-op means this load can only ever ADD.
 */
const CLIP_UPSERT = 'on conflict (clip_id) do nothing;';

const SHOT_INSERT = (values: string[]) => `insert into shots (
  shot_id, clip_id, shot_index, tc_in, tc_out, duration_s,
  verbatim_text, description, subject_role, action, food_item, food_role,
  setting, mood
)
select v.shot_id::text, v.clip_id::text, v.shot_index::int,
       v.tc_in::numeric, v.tc_out::numeric, v.duration_s::numeric,
       coalesce(v.verbatim_literal::text,
                substr(c.verbatim_prompt, v.slice_at::int, v.slice_len::int)),
       v.description::text, v.subject_role::text, v.action::text,
       v.food_item::text, v.food_role::text, v.setting::text, v.mood::text
from (values
${values.join(',\n')}
) as v(shot_id, clip_id, shot_index, tc_in, tc_out, duration_s, verbatim_literal,
       slice_at, slice_len, description, subject_role, action, food_item,
       food_role, setting, mood)
join clips c on c.clip_id = v.clip_id
-- The clip insert above is DO NOTHING, so for a clip that ALREADY existed
-- its row still holds the original shot_count and the original shots. Without
-- this guard the shot insert would still run for it, and wherever this
-- splitter finds more beats than the original decomposition did, the extra
-- higher-index shots would land on top — leaving one clip carrying two
-- different decompositions at once (28 clips, 44 stray shots, seen for real).
-- For a clip this load actually inserted, shot_count is this run's own count,
-- so every shot passes.
where v.shot_index::int <= c.shot_count
-- Same reasoning as the clips: never touch a shot that already exists.
on conflict (shot_id) do nothing;`;

function main() {
  const argChunk = process.argv.indexOf('--chunk');
  const CHUNK = argChunk >= 0 ? Number(process.argv[argChunk + 1]) : 60;

  const rows = loadSourceLibrary().filter((r) => !r.prefilter_flag);

  const tally = { noHeadline: 0, cut: 0, review: 0, keep: 0, noShots: 0, dupe: 0 };
  type Unit = { clip: string; shots: string[] };
  const units: Unit[] = [];

  /**
   * The sheet holds the same film under more than one gallery id — three pairs
   * share a source_url and one of those also shares its prompt verbatim.
   * Distinct ids mean distinct clip_ids, so the primary key does NOT catch
   * this; without an explicit check the library would show the same film
   * twice. First occurrence wins.
   */
  const seenPrompt = new Set<string>();
  const seenSource = new Set<string>();
  const normPrompt = (p: string) => p.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const r of rows) {
    const pk = normPrompt(r.verbatim_prompt);
    if (seenPrompt.has(pk) || (r.source_url && seenSource.has(r.source_url))) {
      tally.dupe++;
      continue;
    }

    const { title, summary } = deriveHeadline(r.verbatim_prompt);
    // No film described — only direction to the generator. Nothing to show.
    if (title === 'Untitled Film' || !summary) { tally.noHeadline++; continue; }

    const g = gate({ title, summary, verbatim_prompt: r.verbatim_prompt });
    if (g.verdict === 'cut') { tally.cut++; continue; }
    if (g.verdict !== 'keep') { tally.review++; continue; }

    const d = offlineDecompose({ title, summary, verbatim_prompt: r.verbatim_prompt });
    if (d.shots.length === 0) { tally.noShots++; continue; }
    tally.keep++;
    // Claimed only once the row is actually loading, so a row dropped by the
    // gate never suppresses a later good row that shares its post.
    seenPrompt.add(pk);
    if (r.source_url) seenSource.add(r.source_url);

    const clipId = `APX-C-${r.video_id}`;
    const author = authorFrom(r.source_url);
    const hospitality = g.evidence.some(
      (e) => e.rule === 'rescue' && ['venue', 'kitchen', 'beverage', 'stay'].includes(e.term),
    );

    const clip = `(${[
      q(clipId), q(r.video_id), q(title), q(summary),
      d.runtime_s === null ? 'null' : String(d.runtime_s),
      q(d.aspect_ratio), q(r.source_url), q(r.verbatim_prompt),
      'null', 'null', q('missing'), String(d.shots.length),
      q('keep'), q('pass'), q(hospitality ? 'direct' : 'aspirational'),
      q(d.realism_level), q(d.grade), q(d.motion_feel), q('none'), 'null',
      q(`offline real-world gate: ${g.note}`), q('seedance_2.0'),
      q(author.name), q(author.url),
      'null', 'null', // licence unproven for these rows — see header
    ].join(', ')})`;

    const shots = d.shots.map((s) => {
      const dur = s.tc_in >= 0 && s.tc_out >= 0 ? Math.round((s.tc_out - s.tc_in) * 10) / 10 : null;
      const at = r.verbatim_prompt.indexOf(s.verbatim_text);
      return `(${[
        q(`APX-S-${r.video_id}-${s.shot_index}`), q(clipId), String(s.shot_index),
        s.tc_in >= 0 ? String(s.tc_in) : 'null',
        s.tc_out >= 0 ? String(s.tc_out) : 'null',
        dur === null ? 'null' : String(dur),
        at >= 0 ? 'null' : q(s.verbatim_text),
        at >= 0 ? String(at + 1) : 'null',
        at >= 0 ? String(s.verbatim_text.length) : 'null',
        q(s.description), qTag(s.subject_role), qTag(s.action), qTag(s.food_item),
        qTag(s.food_role), qTag(s.setting), qTag(s.mood),
      ].join(', ')})`;
    });

    units.push({ clip, shots });
  }

  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) {
    if (/^library_load_\d+\.sql$/.test(f)) fs.unlinkSync(path.join(OUT, f));
  }

  let n = 0;
  let totalShots = 0;
  for (let i = 0; i < units.length; i += CHUNK) {
    const slice = units.slice(i, i + CHUNK);
    const shotValues = slice.flatMap((u) => u.shots);
    totalShots += shotValues.length;
    const sql = `-- Generated by scripts/import/build-library-load-sql.ts — do not hand-edit.
-- Chunk ${++n}: ${slice.length} clips, ${shotValues.length} shots. Re-runnable (upserts).

insert into clips (${CLIP_COLS}) values
${slice.map((u) => u.clip).join(',\n')}
${CLIP_UPSERT}

${SHOT_INSERT(shotValues)}
`;
    fs.writeFileSync(path.join(OUT, `library_load_${String(n).padStart(3, '0')}.sql`), sql, 'utf8');
  }

  console.log(`Source rows (clean):      ${rows.length}`);
  console.log(`  no film described:      ${tally.noHeadline}`);
  console.log(`  gate cut:               ${tally.cut}`);
  console.log(`  gate review (held):     ${tally.review}`);
  console.log(`  no shots parsed:        ${tally.noShots}`);
  console.log(`  same film, second id:   ${tally.dupe}`);
  console.log(`  LOADING:                ${tally.keep} clips · ${totalShots} shots`);
  console.log(`\nWrote ${n} chunk(s) to ${OUT}/library_load_NNN.sql`);
}

main();
