/**
 * Seed the 17 demo clips + 103 shots from data/apex_clips.csv / apex_shots.csv.
 *
 * These are fixtures + demo seed (PRD §3) — they carry pre-filled verdicts
 * from Aidan's calibration and are marked is_demo_seed so they can be
 * distinguished from (or removed before) the gated library load.
 *
 * Usage: npx tsx scripts/seed-demo.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
const db = createClient(url, key, { auth: { persistSession: false } });

const read = (f: string) =>
  parse(fs.readFileSync(path.join(process.cwd(), 'data', f), 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

const nn = (s: string) => (s === '' ? null : s);
const num = (s: string) => (s === '' ? null : Number(s));

async function main() {
  const clips = read('apex_clips.csv').map((c) => ({
    clip_id: c.clip_id,
    title: c.title,
    generator: c.generator,
    runtime_s: num(c.runtime_s),
    aspect_ratio: nn(c.aspect_ratio),
    video_url: nn(c.video_url),
    thumbnail_url: nn(c.thumbnail_url),
    source_url: nn(c.source_url),
    asset_status: c.asset_status,
    shot_count: num(c.shot_count),
    summary: c.summary,
    source_prompt_file: nn(c.source_prompt_file),
    verdict: c.verdict,
    step1_grounded_brand_safe: c.step1_grounded_brand_safe,
    home_route: nn(c.home_route),
    cut_reason: nn(c.cut_reason),
    occasion_context: nn(c.occasion_context),
    distinctiveness: nn(c.distinctiveness),
    register: nn(c.register),
    product_fit: nn(c.product_fit),
    realism_level: nn(c.realism_level),
    render_stack: nn(c.render_stack),
    grade: nn(c.grade),
    motion_feel: nn(c.motion_feel),
    prompt_health: nn(c.prompt_health),
    risk_flags: nn(c.risk_flags),
    ip_flags: nn(c.ip_flags),
    fix_note: nn(c.fix_note),
    calibration_note: nn(c.calibration_note),
    is_demo_seed: true,
  }));

  const shots = read('apex_shots.csv').map((s) => ({
    shot_id: s.shot_id,
    clip_id: s.clip_id,
    shot_index: num(s.shot_index),
    tc_in: num(s.tc_in),
    tc_out: num(s.tc_out),
    duration_s: num(s.duration_s),
    verbatim_text: s.verbatim_text,
    description: s.description,
    shot_deeplink: nn(s.shot_deeplink),
    subject_role: nn(s.subject_role),
    action: nn(s.action),
    food_item: nn(s.food_item),
    food_role: nn(s.food_role),
    setting: nn(s.setting),
    camera_framing: nn(s.camera_framing),
    camera_angle: nn(s.camera_angle),
    camera_movement: nn(s.camera_movement),
    motion_speed: nn(s.motion_speed),
    lighting: nn(s.lighting),
    vfx: nn(s.vfx),
    audio_sfx: nn(s.audio_sfx),
    dialogue: nn(s.dialogue),
    mood: nn(s.mood),
    liftable: nn(s.liftable),
    shot_risk: nn(s.shot_risk),
  }));

  let res = await db.from('clips').upsert(clips);
  if (res.error) throw new Error(`clips: ${res.error.message}`);
  res = await db.from('shots').upsert(shots);
  if (res.error) throw new Error(`shots: ${res.error.message}`);
  console.log(`Seeded ${clips.length} demo clips and ${shots.length} shots.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
