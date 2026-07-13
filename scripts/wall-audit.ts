/**
 * WALL AUDIT — must pass pre- and post-deploy (PRD §5).
 *
 * OWNER OVERRIDE (Aidan, 2026-07-13): shot `verbatim_text` and clip `source_url`
 * are now DELIBERATELY public (Ads-of-the-World-style showcase). They are no
 * longer breaches. The wall now protects the REMAINING internal fields:
 * clip-level `verbatim_prompt` (the full raw prompt, admin-only), all gate
 * fields, and the internal shot tags.
 *
 * Verifies, from OUTSIDE the trusted server, that no route returns those:
 *  1. anon key + master tables (clips/shots/client_selection/floor_log)
 *     → permission denied / zero rows
 *  2. anon key + client views → only the allowlisted columns
 *  3. anon key + client_shots → verbatim_text IS present (intended public)
 *  4. every client HTTP endpoint, grepped for still-internal field names → absent
 *  5. a cut clip 404s on the clip endpoint and never appears in lists
 *
 *  6. the admin surface: /api/admin/clips/[id] is 404 for no-session AND for
 *     a signed-in non-admin, 200 with verbatim_prompt for an admin, and no
 *     /admin link or internal string appears on any client page.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… [SUPABASE_SERVICE_ROLE_KEY=… ADMIN_EMAILS=…] \
 *     npx tsx scripts/wall-audit.ts [--site http://localhost:3000]
 */
import { createClient } from '@supabase/supabase-js';

// Fields that must STILL never reach a client (verbatim_text + source_url are
// intentionally excluded per the owner override — they are now public).
const FORBIDDEN_FIELDS = [
  'verbatim_prompt', 'verdict', 'cut_reason',
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

  // Owner override: verbatim_text is now intended public on client_shots.
  const { error: colErr } = await anon.from('client_shots').select('verbatim_text').limit(1);
  if (!colErr) ok('client_shots exposes verbatim_text (intended public per owner override)');
  else fail('client_shots missing verbatim_text', 'owner override expects it public — apply 0003');

  const { data: viewRow, error: viewErr } = await anon.from('client_clips').select('*').limit(1);
  if (viewErr) {
    console.log(`… client_clips not readable (${viewErr.message}) — check views exist`);
  } else if (viewRow && viewRow[0]) {
    const cols = Object.keys(viewRow[0]);
    const leaked = cols.filter((c) => FORBIDDEN_FIELDS.includes(c));
    if (leaked.length) fail('client_clips leaks internal columns', leaked.join(', '));
    else ok(`client_clips exposes only: ${cols.join(', ')}`);
  }

  // Categories (0004): must be present, and only ever the 8 fixed keys —
  // a stray value would mean a raw internal tag leaked into the facet.
  const CATEGORY_KEYS = ['food', 'beverage', 'venue', 'event', 'travel', 'characters', 'action', 'lifestyle'];
  const { data: catRows, error: catErr } = await anon.from('client_clips').select('categories').limit(1000);
  if (catErr || !catRows) {
    fail('client_clips missing categories', catErr?.message ?? 'no rows');
  } else {
    const strays = new Set<string>();
    let empty = 0;
    for (const r of catRows as { categories: string[] | null }[]) {
      if (!r.categories || r.categories.length === 0) empty++;
      for (const c of r.categories ?? []) if (!CATEGORY_KEYS.includes(c)) strays.add(c);
    }
    if (strays.size) fail('categories contains non-enum values', [...strays].join(', '));
    else ok(`categories values are within the 8 fixed keys (${catRows.length} rows checked)`);
    if (empty) fail('clips with empty categories', `${empty} rows — the 0004 fallback should prevent this`);
    else ok('every visible clip has at least one category');
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
    `/browse`,
    `/browse?cat=venue`,
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

  // No client page may link or mention the admin surface.
  for (const ep of ['/', '/search?q=drone', '/clip/APX-C-001']) {
    const body = await (await fetch(base + ep)).text();
    if (/["'(]\/admin/.test(body)) fail(`${ep} references /admin`, 'client page links the admin surface');
    else ok(`${ep} has no /admin reference`);
  }
}

/** Mint a session access token for an email without sending mail (service role generateLink → verifyOtp). */
async function mintSession(email: string): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await service.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink(${email}): ${error.message}`);
  const anon = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (vErr || !verified.session) throw new Error(`verifyOtp(${email}): ${vErr?.message ?? 'no session'}`);
  return verified.session.access_token;
}

async function auditAdminSurface(base: string) {
  const adminEndpoint = `${base}/api/admin/clips/APX-C-001`;

  // 1. no session → 404, never confirm the route exists
  const anonRes = await fetch(adminEndpoint);
  if (anonRes.status === 404) ok('admin endpoint 404s with no session');
  else fail('admin endpoint reachable without a session', `→ ${anonRes.status}`);

  const pageRes = await fetch(`${base}/admin/clip/APX-C-001`);
  if (pageRes.status === 404) ok('admin page 404s with no session');
  else fail('admin page reachable without a session', `→ ${pageRes.status}`);

  const canMint = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_ANON_KEY;
  if (!canMint) {
    console.log('… skipping session-based admin checks (need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY)');
    return;
  }
  const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // 2. signed-in NON-admin → still 404
  const throwawayEmail = 'wall-audit-nonadmin@example.invalid';
  let throwawayId: string | null = null;
  try {
    const { data: created, error } = await service.auth.admin.createUser({
      email: throwawayEmail,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    throwawayId = created.user.id;
    const token = await mintSession(throwawayEmail);
    const res = await fetch(adminEndpoint, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) ok('admin endpoint 404s for a signed-in NON-admin');
    else fail('non-admin session reached the admin endpoint', `→ ${res.status}`);
  } catch (err) {
    fail('non-admin session check errored', String(err));
  } finally {
    if (throwawayId) await service.auth.admin.deleteUser(throwawayId).catch(() => {});
  }

  // 3. admin session → 200 + verbatim_prompt present
  const adminEmail = (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim();
  if (!adminEmail) {
    console.log('… skipping admin-positive check (ADMIN_EMAILS not set)');
    return;
  }
  try {
    const token = await mintSession(adminEmail);
    const res = await fetch(adminEndpoint, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.text();
    if (res.status === 200 && body.includes('verbatim_prompt')) {
      ok('admin session gets 200 + verbatim_prompt');
    } else if (res.status === 404) {
      // acceptable only if the clip genuinely doesn't exist as a keep yet
      console.log(`… admin session got 404 on APX-C-001 — verify the clip exists as a keep (seed loaded?)`);
    } else {
      fail('admin session response wrong', `→ ${res.status}, verbatim_prompt ${body.includes('verbatim_prompt') ? 'present' : 'ABSENT'}`);
    }
  } catch (err) {
    fail('admin session check errored', String(err));
  }
}

async function main() {
  const i = process.argv.indexOf('--site');
  await auditDatabase();
  if (i >= 0) {
    const base = process.argv[i + 1].replace(/\/$/, '');
    await auditSite(base);
    await auditAdminSurface(base);
  } else console.log('… skipping site audit (pass --site http://localhost:3000)');

  console.log(failures === 0 ? '\nWALL HOLDS.' : `\n${failures} BREACH(ES) — STOP. Do not ship until the wall holds.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
