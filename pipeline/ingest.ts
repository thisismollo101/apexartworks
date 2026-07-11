/**
 * INGEST — the pipeline (PRD §4).
 *
 *   source CSV → junk skip → THE GATE → cuts logged / keeps decomposed → Supabase
 *
 * - Junk rows (prefilter_flag set) skip the gate entirely → out/junk_log.csv.
 * - FLOOR cuts are logged by video_id ONLY (floor_log table + out/floor_log.csv).
 *   Their prompt and source URL are never stored, fetched, or surfaced.
 * - Ordinary cuts become clip rows (verdict=cut + cut_reason) with NO shots.
 * - Keeps are decomposed into shots and loaded with the full internal layer.
 * - Every gate/decompose result is checkpointed to out/*.jsonl so re-runs
 *   resume instead of re-spending API calls.
 * - Verdicts below confidence 0.75 land in out/review_pile.csv for Aidan.
 *
 * Usage:
 *   npx tsx pipeline/ingest.ts [--limit N] [--dry-run] [--concurrency 8]
 *     --dry-run     gate + decompose + logs only; nothing written to Supabase
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { gatePrompt, pool, GATE_MODEL_RESOLVED } from './classify';
import { REVIEW_CONFIDENCE_THRESHOLD, type GateVerdict } from './gate-rules';
import { decomposePrompt, clientTextWarnings, type Decomposition } from './decompose';
import { loadSourceLibrary, isJunk, type SourceRow } from './source';

const OUT = path.join(process.cwd(), 'out');
const GATE_CKPT = path.join(OUT, 'gate_results.jsonl');
const DECOMP_CKPT = path.join(OUT, 'decompose_results.jsonl');

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, dflt: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};

function loadCheckpoint<T>(file: string): Map<string, T> {
  const map = new Map<string, T>();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line);
      map.set(rec.video_id, rec);
    }
  }
  return map;
}

const appendJsonl = (file: string, rec: unknown) =>
  fs.appendFileSync(file, JSON.stringify(rec) + '\n');

const csvCell = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;

type GateRec = { video_id: string; verdict: GateVerdict };
type DecompRec = { video_id: string; decomposition: Decomposition; warnings: string[] };

function supabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (or pass --dry-run)');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const dryRun = flag('--dry-run');
  const limit = opt('--limit', Infinity);
  const concurrency = opt('--concurrency', 8);
  fs.mkdirSync(OUT, { recursive: true });

  const all = loadSourceLibrary();
  const junk = all.filter(isJunk);
  let gateable = all.filter((r) => !isJunk(r));
  if (Number.isFinite(limit)) gateable = gateable.slice(0, limit);

  fs.writeFileSync(
    path.join(OUT, 'junk_log.csv'),
    'video_id,prefilter_flag\n' + junk.map((r) => `${r.video_id},${r.prefilter_flag}`).join('\n') + '\n',
  );
  console.log(`Source: ${all.length} rows — ${junk.length} junk (skipped, never gated), ${gateable.length} gateable`);
  console.log(`Model: ${GATE_MODEL_RESOLVED} · concurrency ${concurrency} · ${dryRun ? 'DRY RUN (no Supabase writes)' : 'live load'}\n`);

  // ---------- PHASE 1: the gate (checkpointed) ----------
  const gateResults = loadCheckpoint<GateRec>(GATE_CKPT);
  const toGate = gateable.filter((r) => !gateResults.has(r.video_id));
  console.log(`Gate: ${gateResults.size} cached, ${toGate.length} to classify`);

  let done = 0;
  await pool(toGate, concurrency, async (row) => {
    try {
      const verdict = await gatePrompt(row.verbatim_prompt);
      const rec: GateRec = { video_id: row.video_id, verdict };
      gateResults.set(row.video_id, rec);
      appendJsonl(GATE_CKPT, rec);
    } catch (err) {
      console.error(`  gate error #${row.video_id}: ${err}`);
    }
    if (++done % 100 === 0) console.log(`  …${done}/${toGate.length}`);
  });

  const gated = gateable.filter((r) => gateResults.has(r.video_id));
  const floorCuts = gated.filter((r) => !gateResults.get(r.video_id)!.verdict.floor_pass);
  const keeps = gated.filter((r) => gateResults.get(r.video_id)!.verdict.verdict === 'keep');
  const cuts = gated.filter(
    (r) => gateResults.get(r.video_id)!.verdict.verdict === 'cut' && gateResults.get(r.video_id)!.verdict.floor_pass,
  );

  // Floor log: video_id ONLY. No prompt, no URL, nothing else (PRD §2 FLOOR).
  fs.writeFileSync(
    path.join(OUT, 'floor_log.csv'),
    'video_id\n' + floorCuts.map((r) => r.video_id).join('\n') + '\n',
  );

  // Review pile for Aidan: low-confidence verdicts are flagged, not silently decided.
  const review = gated
    .map((r) => ({ row: r, v: gateResults.get(r.video_id)!.verdict }))
    .filter(({ row, v }) => v.confidence < REVIEW_CONFIDENCE_THRESHOLD && v.floor_pass && !floorCuts.includes(row));
  fs.writeFileSync(
    path.join(OUT, 'review_pile.csv'),
    'video_id,verdict,cut_reason,home_route,confidence,note,prompt_excerpt\n' +
      review
        .map(({ row, v }) =>
          [row.video_id, v.verdict, v.cut_reason, v.step2_home_route, v.confidence, csvCell(v.note), csvCell(row.verbatim_prompt.slice(0, 200))].join(','),
        )
        .join('\n') + '\n',
  );

  const keepRate = ((keeps.length / gated.length) * 100).toFixed(1);
  console.log(`\nGate results: ${keeps.length} keep (${keepRate}%) · ${cuts.length} cut · ${floorCuts.length} FLOOR cut · ${review.length} for review`);
  console.log(`PRD expectation ≈19% keep (~650–700). ${Math.abs(keeps.length / gated.length - 0.19) > 0.10 ? '⚠ LARGE DEVIATION — stop and review before loading.' : 'Within expected range.'}`);

  // ---------- PHASE 2: decompose keeps (checkpointed) ----------
  const decompResults = loadCheckpoint<DecompRec>(DECOMP_CKPT);
  const toDecompose = keeps.filter((r) => !decompResults.has(r.video_id));
  console.log(`\nDecompose: ${decompResults.size} cached, ${toDecompose.length} to decompose`);

  done = 0;
  await pool(toDecompose, concurrency, async (row) => {
    try {
      const verdict = gateResults.get(row.video_id)!.verdict;
      const decomposition = await decomposePrompt(row.verbatim_prompt, row.has_timecode, verdict);
      const warnings = clientTextWarnings(decomposition);
      const rec: DecompRec = { video_id: row.video_id, decomposition, warnings };
      decompResults.set(row.video_id, rec);
      appendJsonl(DECOMP_CKPT, rec);
      if (warnings.length) console.warn(`  ⚠ #${row.video_id}: ${warnings.join('; ')}`);
    } catch (err) {
      console.error(`  decompose error #${row.video_id}: ${err}`);
    }
    if (++done % 50 === 0) console.log(`  …${done}/${toDecompose.length}`);
  });

  const shotCount = [...decompResults.values()].reduce((n, d) => n + d.decomposition.shots.length, 0);
  console.log(`Decomposed: ${decompResults.size} keepers → ${shotCount} shot rows`);

  if (dryRun) {
    console.log('\nDRY RUN complete — nothing written to Supabase.');
    return;
  }

  // ---------- PHASE 3: load to Supabase (service role) ----------
  const db = supabase();
  console.log('\nLoading to Supabase…');

  // Floor log first — video_id only.
  if (floorCuts.length) {
    const { error } = await db.from('floor_log').upsert(floorCuts.map((r) => ({ video_id: r.video_id })));
    if (error) throw new Error(`floor_log: ${error.message}`);
  }

  // Ordinary cuts: clip row with verdict=cut, no shots — ever.
  const cutRows = cuts.map((r) => {
    const v = gateResults.get(r.video_id)!.verdict;
    return {
      clip_id: `APX-C-${r.video_id}`,
      video_id: r.video_id,
      source_url: r.source_url,
      verbatim_prompt: r.verbatim_prompt,
      verdict: 'cut',
      cut_reason: v.cut_reason,
      step1_grounded_brand_safe: v.step1,
      home_route: v.step2_home_route,
      gate_confidence: v.confidence,
      gate_notes: v.note,
      asset_status: 'missing',
      generator: 'seedance_2.0',
    };
  });

  const keepRows: Record<string, unknown>[] = [];
  const shotRows: Record<string, unknown>[] = [];
  for (const r of keeps) {
    const d = decompResults.get(r.video_id)?.decomposition;
    if (!d) continue; // decompose failed — stays out of the library until re-run
    const v = gateResults.get(r.video_id)!.verdict;
    const clipId = `APX-C-${r.video_id}`;
    keepRows.push({
      clip_id: clipId,
      video_id: r.video_id,
      title: d.title,
      summary: d.summary,
      runtime_s: d.runtime_s > 0 ? d.runtime_s : null,
      aspect_ratio: d.aspect_ratio === 'unknown' ? null : d.aspect_ratio,
      source_url: r.source_url,
      verbatim_prompt: r.verbatim_prompt,
      asset_status: 'missing',
      shot_count: d.shots.length,
      verdict: 'keep',
      step1_grounded_brand_safe: v.step1,
      home_route: v.step2_home_route,
      cut_reason: null,
      distinctiveness: v.distinctiveness,
      register: v.register,
      realism_level: d.realism_level,
      render_stack: d.render_stack,
      grade: d.grade === 'none' ? null : d.grade,
      motion_feel: d.motion_feel,
      ip_flags: v.ip_flag ? 'flagged-for-review' : 'none',
      gate_confidence: v.confidence,
      gate_notes: v.note,
      generator: 'seedance_2.0',
    });
    d.shots.forEach((s, i) => {
      shotRows.push({
        shot_id: `APX-S-${r.video_id}-${i + 1}`,
        clip_id: clipId,
        shot_index: i + 1,
        tc_in: s.tc_in >= 0 ? s.tc_in : null,
        tc_out: s.tc_out >= 0 ? s.tc_out : null,
        duration_s: s.tc_in >= 0 && s.tc_out >= 0 ? Math.round((s.tc_out - s.tc_in) * 10) / 10 : null,
        verbatim_text: s.verbatim_text,
        description: s.description,
        shot_deeplink: null, // derived from video_url when assets are linked
        subject_role: s.subject_role,
        action: s.action,
        food_item: s.food_item,
        food_role: s.food_role,
        setting: s.setting,
        camera_framing: s.camera_framing === 'none' ? null : s.camera_framing,
        camera_angle: s.camera_angle === 'none' ? null : s.camera_angle,
        camera_movement: s.camera_movement,
        motion_speed: s.motion_speed === 'none' ? null : s.motion_speed,
        lighting: s.lighting,
        vfx: s.vfx,
        mood: s.mood === 'none' ? null : s.mood,
      });
    });
  }

  const BATCH = 500;
  for (const [table, rows] of [
    ['clips', [...cutRows, ...keepRows]],
    ['shots', shotRows],
  ] as const) {
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await db.from(table).upsert(rows.slice(i, i + BATCH));
      if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
    }
    console.log(`  ${table}: ${rows.length} rows upserted`);
  }

  console.log(`\nINGEST COMPLETE — ${keepRows.length} keepers in the library, ${cutRows.length} cuts logged, ${floorCuts.length} floor-logged, ${shotRows.length} shots.`);
  console.log(`Review pile for Aidan: out/review_pile.csv (${review.length} rows)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
