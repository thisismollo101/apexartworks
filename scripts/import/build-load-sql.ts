/**
 * Build the SQL that loads the imported clips and shots.
 *
 * Emits out/import_load.sql rather than writing to Supabase directly, so the
 * exact statements can be read before anything touches the live library.
 * Everything is `on conflict … do update`, so a re-run is a no-op refresh.
 *
 * What is and is not written:
 *   - KEEP rows → clips + shots.
 *   - CUT rows → nothing. The live table holds 766 rows, all keeps, so cuts
 *     have never been stored here; the full cut record with its evidence lives
 *     in out/import_gate.jsonl, which costs nothing and stays auditable.
 *   - FLOOR cuts → out/import_floor.csv, by video_id only. No prompt, no URL
 *     ever leaves that file (PRD §2 FLOOR), matching pipeline/ingest.ts.
 *   - REVIEW rows → nothing, unless listed in out/import_decisions.csv.
 *     Undecided is not a keep and it is not a cut.
 *
 * Usage: npx tsx scripts/import/build-load-sql.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSourceLibrary } from '../../pipeline/source';
import { offlineDecompose } from '../../pipeline/offline-decompose';
import { COLLECTION } from './readme-source';
import { OUT, SOURCE_V2, classifyAll, loadMeta } from './classify';

/** Aidan's calls on the review pile: `video_id,decision` with keep|cut. */
const DECISIONS = path.join(OUT, 'import_decisions.csv');

function loadDecisions(): Map<string, 'keep' | 'cut'> {
  const out = new Map<string, 'keep' | 'cut'>();
  if (!fs.existsSync(DECISIONS)) return out;
  for (const line of fs.readFileSync(DECISIONS, 'utf8').split(/\r?\n/).slice(1)) {
    const [id, decision] = line.split(',').map((s) => s?.trim());
    if (id && (decision === 'keep' || decision === 'cut')) out.set(id, decision);
  }
  return out;
}

const q = (v: string | number | null): string => {
  if (v === null || v === '') return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  return `'${v.replace(/'/g, "''")}'`;
};
/** 'none' is the schema's absent marker; the column should be NULL. */
const qTag = (v: string) => (v === 'none' || !v ? 'null' : q(v));

function main() {
  const rows = new Map(loadSourceLibrary(SOURCE_V2).map((r) => [r.video_id, r]));
  const meta = loadMeta();
  const decisions = loadDecisions();
  const gate = classifyAll();

  const selected = gate.filter((g) => {
    const override = decisions.get(g.video_id);
    if (override) return override === 'keep';
    return g.verdict === 'keep';
  });

  const clipValues: string[] = [];
  const shotValues: string[] = [];

  for (const g of selected) {
    const r = rows.get(g.video_id);
    const m = meta[g.video_id];
    if (!r || !m) continue;

    const d = offlineDecompose({ title: m.title, summary: m.summary, verbatim_prompt: r.verbatim_prompt });
    const clipId = `APX-C-${g.video_id}`;

    // The offline gate does not run the LLM's home test, so home_route is
    // recorded from what it DID observe: a hospitality anchor in the evidence.
    // Anything else is 'aspirational' — real-world craft with no food/venue.
    const hospitality = g.evidence.some(
      (e) => e.rule === 'rescue' && ['venue', 'kitchen', 'beverage', 'stay'].includes(e.term),
    );

    clipValues.push(
      `(${[
        q(clipId),
        q(g.video_id),
        q(m.title),
        q(m.summary),
        d.runtime_s === null ? 'null' : String(d.runtime_s),
        q(d.aspect_ratio),
        q(r.source_url),
        q(r.verbatim_prompt),
        q(m.video_url),
        q(m.thumbnail_url),
        q(m.video_url ? 'linked-external' : 'missing'),
        String(d.shots.length),
        q('keep'),
        q('pass'),
        q(hospitality ? 'direct' : 'aspirational'),
        q(d.realism_level),
        q(d.grade),
        q(d.motion_feel),
        q('none'),
        // Confidence is not a probability here — it is a flat marker that this
        // row came from the deterministic gate, not the model. Recording a
        // fake score would be worse than recording none.
        'null',
        q(`offline real-world gate: ${g.note}`),
        q('seedance_2.0'),
        q(m.author_name),
        q(m.author_url),
        q(COLLECTION.licence),
        q(COLLECTION.licenceUrl),
      ].join(', ')})`,
    );

    d.shots.forEach((s) => {
      const dur = s.tc_in >= 0 && s.tc_out >= 0 ? Math.round((s.tc_out - s.tc_in) * 10) / 10 : null;
      // A shot's verbatim_text is almost always a contiguous slice of the clip
      // prompt (measured: 174 of 178). Sending an offset and a length instead
      // of the text itself lets Postgres cut it from the verbatim_prompt this
      // same run already stored — the row is identical either way. The handful
      // that are not slices (sentence-grouped prose, which is whitespace
      // normalised) carry their text literally.
      const at = r.verbatim_prompt.indexOf(s.verbatim_text);
      shotValues.push(
        `(${[
          q(`APX-S-${g.video_id}-${s.shot_index}`),
          q(clipId),
          String(s.shot_index),
          s.tc_in >= 0 ? String(s.tc_in) : 'null',
          s.tc_out >= 0 ? String(s.tc_out) : 'null',
          dur === null ? 'null' : String(dur),
          at >= 0 ? 'null' : q(s.verbatim_text), // literal only when not a slice
          at >= 0 ? String(at + 1) : 'null', // substr() is 1-indexed
          at >= 0 ? String(s.verbatim_text.length) : 'null',
          q(s.description),
          qTag(s.subject_role),
          qTag(s.action),
          qTag(s.food_item),
          qTag(s.food_role),
          qTag(s.setting),
          qTag(s.mood),
        ].join(', ')})`,
      );
    });
  }

  const sql = `-- Generated by scripts/import/build-load-sql.ts — do not hand-edit.
-- ${selected.length} clips, ${shotValues.length} shots from ${COLLECTION.owner}/${COLLECTION.name} (${COLLECTION.licence}).
-- Re-runnable: every statement upserts.

insert into clips (
  clip_id, video_id, title, summary, runtime_s, aspect_ratio, source_url,
  verbatim_prompt, video_url, thumbnail_url, asset_status, shot_count, verdict,
  step1_grounded_brand_safe, home_route, realism_level, grade, motion_feel,
  ip_flags, gate_confidence, gate_notes, generator,
  author_name, author_url, license, license_url
) values
${clipValues.join(',\n')}
on conflict (clip_id) do update set
  title = excluded.title, summary = excluded.summary, runtime_s = excluded.runtime_s,
  aspect_ratio = excluded.aspect_ratio, verbatim_prompt = excluded.verbatim_prompt,
  video_url = excluded.video_url, thumbnail_url = excluded.thumbnail_url,
  asset_status = excluded.asset_status, shot_count = excluded.shot_count,
  realism_level = excluded.realism_level, grade = excluded.grade,
  motion_feel = excluded.motion_feel, gate_notes = excluded.gate_notes,
  author_name = excluded.author_name, author_url = excluded.author_url,
  license = excluded.license, license_url = excluded.license_url;

insert into shots (
  shot_id, clip_id, shot_index, tc_in, tc_out, duration_s,
  verbatim_text, description, subject_role, action, food_item, food_role,
  setting, mood
)
-- Casts are explicit because a VALUES column whose first row is NULL is typed
-- "unknown", which will not implicitly coerce to numeric.
select v.shot_id::text, v.clip_id::text, v.shot_index::int,
       v.tc_in::numeric, v.tc_out::numeric, v.duration_s::numeric,
       coalesce(v.verbatim_literal::text,
                substr(c.verbatim_prompt, v.slice_at::int, v.slice_len::int)),
       v.description::text, v.subject_role::text, v.action::text,
       v.food_item::text, v.food_role::text, v.setting::text, v.mood::text
from (values
${shotValues.join(',\n')}
) as v(shot_id, clip_id, shot_index, tc_in, tc_out, duration_s, verbatim_literal,
       slice_at, slice_len, description, subject_role, action, food_item,
       food_role, setting, mood)
join clips c on c.clip_id = v.clip_id
on conflict (shot_id) do update set
  shot_index = excluded.shot_index, tc_in = excluded.tc_in, tc_out = excluded.tc_out,
  duration_s = excluded.duration_s, verbatim_text = excluded.verbatim_text,
  description = excluded.description, subject_role = excluded.subject_role,
  action = excluded.action, food_item = excluded.food_item,
  food_role = excluded.food_role, setting = excluded.setting, mood = excluded.mood;
`;

  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'import_load.sql');
  fs.writeFileSync(file, sql, 'utf8');

  const overridden = [...decisions.keys()].length;
  console.log(`${selected.length} clips · ${shotValues.length} shots`);
  console.log(`  ${overridden} review decisions applied from out/import_decisions.csv`);
  console.log(`  ${selected.filter((g) => meta[g.video_id]?.video_url).length} with a hosted MP4`);
  console.log(`Wrote ${file} (${(sql.length / 1024).toFixed(0)} KB)`);
}

main();
