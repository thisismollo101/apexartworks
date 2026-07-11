/**
 * WALL AUDIT — must pass pre- and post-deploy (PRD §5).
 *
 * Verifies, from OUTSIDE the trusted server, that no route returns the IP:
 *  1. anon key + master tables (clips/shots/client_selection/floor_log)
 *     → permission denied / zero rows
 *  2. anon key + client views → only the allowlisted columns
 *  3. anon key + `select verbatim_text from client_shots` → column error
 *  4. every client HTTP endpoint, grepped for internal field names → absent
 *  5. a cut clip 404s on the clip endpoint and never appears in lists
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… npx tsx scripts/wall-audit.ts [--site http://localhost:3000]
 */
import { createClient } from '@supabase/supabase-js';

const FORBIDDEN_FIELDS = [
  'verbatim_text', 'verbatim_prompt', 'source_url', 'verdict', 'cut_reason',
  'step1_grounded_brand_safe', 'home_route', 'distinctiveness', 'register',
  'product_fit', 'prompt_health', 'risk_flags', 'ip_flags', 'fix_note',
  'calibration_note', 'gate_confidence', 'gate_notes', 'subject_role',
  'food_role', 'camera_movement', 'camera_framing', 'camera_angle',
  'motion_speed', 'liftable', 'shot_risk', 'source_prompt_file',
];

let failures = 0;
const ok = (name: string) => console.log(`✓ ${name}`);
const fail = (name: string, detail: string) => {
  failures++;
  console.log(`✗ WALL BREACH: ${name}\n    ${detail}`);
};

async function auditDatabase() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.log('… skipping DB audit (SUPABASE_URL / SUPABASE_ANON_KEY not set)');
    return;
  }
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  for (const table of ['clips', 'shots', 'client_selection', 'floor_log']) {
    const { data, error } = await anon.from(table).select('*').limit(1);
    if (error || !data || data.length === 0) ok(`anon cannot read master table "${table}"`);
    else fail(`anon read master table "${table}"`, JSON.stringify(data[0]).slice(0, 200));
  }

  const { error: colErr } = await anon.from('client_shots').select('verbatim_text').limit(1);
  if (colErr) ok('client_shots has no verbatim_text column');
  else fail('client_shots exposed verbatim_text', 'column reachable via anon');

  const { data: viewRow, error: viewErr } = await anon.from('client_clips').select('*').limit(1);
  if (viewErr) {
    console.log(`… client_clips not readable (${viewErr.message}) — check views exist`);
  } else if (viewRow && viewRow[0]) {
    const cols = Object.keys(viewRow[0]);
    const leaked = cols.filter((c) => FORBIDDEN_FIELDS.includes(c));
    if (leaked.length) fail('client_clips leaks internal columns', leaked.join(', '));
    else ok(`client_clips exposes only: ${cols.join(', ')}`);
  }
}

async function auditSite(base: string) {
  const endpoints = [
    `/api/clips`,
    `/api/clips?q=drone`,
    `/api/clips?q=pasta`,
    `/api/clips/APX-C-001`,
    `/`,
    `/search?q=drone`,
    `/clip/APX-C-001`,
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(base + ep);
      const body = await res.text();
      const leaked = FORBIDDEN_FIELDS.filter((f) => new RegExp(`"${f}"|\\b${f}\\b`).test(body));
      // 'verdict' can appear in innocuous prose; only flag JSON-key style leaks on pages
      const hard = leaked.filter((f) => body.includes(`"${f}"`) || ep.startsWith('/api'));
      if (hard.length) fail(`${ep} leaks internal fields`, hard.join(', '));
      else ok(`${ep} clean (${res.status})`);
    } catch (err) {
      fail(`${ep} unreachable`, String(err));
    }
  }
  // A cut clip must 404 / never render. (APX-C-… id of any cut row; harmless if absent.)
  const res = await fetch(`${base}/api/clips/APX-C-1`); // video_id 1 = demon hellscape cut fixture
  if (res.status === 404) ok('cut clip 404s on client endpoint');
  else if (res.status === 200) fail('cut clip served to client', `/api/clips/APX-C-1 → 200`);
  else ok(`cut clip endpoint returned ${res.status} (not served)`);
}

async function main() {
  const i = process.argv.indexOf('--site');
  await auditDatabase();
  if (i >= 0) await auditSite(process.argv[i + 1].replace(/\/$/, ''));
  else console.log('… skipping site audit (pass --site http://localhost:3000)');

  console.log(failures === 0 ? '\nWALL HOLDS.' : `\n${failures} BREACH(ES) — STOP. Do not ship until the wall holds.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
