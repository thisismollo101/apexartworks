/**
 * REGRESSION SUITE — must be green before the gate touches the 3,414 rows.
 *
 * Two fixture sets:
 *  1. FIXTURES (pipeline/fixtures.ts) — pinned real rows of the source
 *     library with Aidan's expected verdicts, including the two child-safety
 *     floor cuts.
 *  2. The 17 seed clips — raw prompt reconstructed by concatenating each
 *     clip's shot verbatim_text (data/apex_shots.csv) in shot order. The
 *     seed CSVs' pre-filled verdict columns are the ANSWER KEY ONLY — the
 *     live gate derives its verdict from the raw prompt and must agree.
 *
 * Any disagreement fails the run: the classifier is wrong, not the ruling.
 *
 * Usage: npx tsx pipeline/regression.ts [--concurrency 4]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { gatePrompt, pool, GATE_MODEL_RESOLVED } from './classify';
import { FIXTURES } from './fixtures';
import { loadSourceLibrary } from './source';

type Check = {
  name: string;
  prompt: string;
  expect: 'keep' | 'cut';
  floor?: boolean;
  cutReasons?: string[];
};

function loadSeedChecks(): Check[] {
  const dataDir = path.join(process.cwd(), 'data');
  const clips = parse(fs.readFileSync(path.join(dataDir, 'apex_clips.csv'), 'utf8'), {
    columns: true, skip_empty_lines: true,
  }) as Record<string, string>[];
  const shots = parse(fs.readFileSync(path.join(dataDir, 'apex_shots.csv'), 'utf8'), {
    columns: true, skip_empty_lines: true,
  }) as Record<string, string>[];

  return clips.map((clip) => {
    const clipShots = shots
      .filter((s) => s.clip_id === clip.clip_id)
      .sort((a, b) => Number(a.shot_index) - Number(b.shot_index));
    const prompt = clipShots.map((s) => s.verbatim_text).join('\n\n');
    return {
      name: `seed ${clip.clip_id} — ${clip.title}`,
      prompt,
      expect: clip.verdict as 'keep' | 'cut', // answer key; all 17 are keeps
    };
  });
}

async function main() {
  const concurrency = Number(process.argv[process.argv.indexOf('--concurrency') + 1]) || 4;
  const source = new Map(loadSourceLibrary().map((r) => [r.video_id, r]));

  const checks: Check[] = [
    ...FIXTURES.map((f) => {
      const row = source.get(f.video_id);
      if (!row) throw new Error(`fixture ${f.name}: video_id ${f.video_id} not in source library`);
      return { name: `lib #${f.video_id} — ${f.name}`, prompt: row.verbatim_prompt, expect: f.expect, floor: f.floor, cutReasons: f.cutReasons };
    }),
    ...loadSeedChecks(),
  ];

  console.log(`Regression: ${checks.length} checks (model: ${GATE_MODEL_RESOLVED}, concurrency: ${concurrency})\n`);

  let failures = 0;
  await pool(checks, concurrency, async (c) => {
    try {
      const v = await gatePrompt(c.prompt);
      const problems: string[] = [];
      if (v.verdict !== c.expect) problems.push(`verdict ${v.verdict} (expected ${c.expect})`);
      if (c.floor && v.floor_pass) problems.push(`floor_pass=true (expected FLOOR cut)`);
      if (!c.floor && c.expect === 'cut' && v.cut_reason === 'floor-child-safety') {
        problems.push(`cut at floor (expected ${c.cutReasons?.join('|')})`);
      }
      if (c.cutReasons && v.verdict === 'cut' && !c.cutReasons.includes(v.cut_reason)) {
        problems.push(`cut_reason ${v.cut_reason} (accepted: ${c.cutReasons.join('|')})`);
      }
      if (problems.length) {
        failures++;
        console.log(`✗ FAIL ${c.name}\n       ${problems.join('; ')}\n       note: ${v.note} (confidence ${v.confidence})`);
      } else {
        console.log(`✓ ${c.name}  [${v.verdict}${v.verdict === 'cut' ? `: ${v.cut_reason}` : ` · ${v.step2_home_route}`}, conf ${v.confidence}]`);
      }
    } catch (err) {
      failures++;
      console.log(`✗ ERROR ${c.name}: ${err}`);
    }
  });

  console.log(failures === 0
    ? `\nALL ${checks.length} CHECKS PASS — the gate may run on the library.`
    : `\n${failures}/${checks.length} FAILED — the classifier is wrong, not the ruling. DO NOT run the library.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
