/**
 * REGRESSION FIXTURES — PRD §3.
 *
 * Each fixture pins a real row of data/apex_source_library.csv (located by
 * searching the prompts and hand-verified). The expected verdicts come from
 * Aidan's 25 calibrated samples + the hand-gated real-data sample. If the
 * classifier disagrees with any of these, the classifier is wrong — fix it,
 * not the ruling (and do NOT edit an expectation without a ruling).
 *
 * The 17 seed clips in data/apex_clips.csv are a second fixture set: their
 * raw prompts are reconstructed from the seed shots' verbatim_text and must
 * all gate to keep (handled in regression.ts, answer key = the seed CSVs).
 *
 * The contested super-speed cooking commercial is deliberately absent
 * (Open Item ② — Aidan's call).
 */

export type Fixture = {
  video_id: string;
  name: string;
  expect: 'keep' | 'cut';
  /** required for floor cuts: floor_pass must be false */
  floor?: true;
  /** acceptable cut_reason values (PRD §5 table; some fail "at Step 1/2") */
  cutReasons?: string[];
};

export const FIXTURES: Fixture[] = [
  // ---- FLOOR (child safety) — hard cuts, logged by video_id only ----
  { video_id: '1402', name: 'classroom romance (minors, romantic framing)', expect: 'cut', floor: true },
  { video_id: '2295', name: 'age-callout sexualised POV ("18-year-old… approaches her from behind")', expect: 'cut', floor: true },

  // ---- Must CUT (step 1/2) ----
  { video_id: '1',    name: 'person→dragon out of the inferno of hell (demon-transform hellscape)', expect: 'cut', cutReasons: ['not-brand-safe', 'not-grounded'] },
  { video_id: '4439', name: 'gacha summon machine + fantasy UI', expect: 'cut', cutReasons: ['no-home', 'not-grounded'] },
  { video_id: '2594', name: 'anime energy-weapon duel', expect: 'cut', cutReasons: ['no-home', 'not-grounded'] },
  { video_id: '5105', name: 'volcanic dark-fantasy + dragon', expect: 'cut', cutReasons: ['not-grounded', 'not-brand-safe'] },
  { video_id: '1473', name: 'pickup truck → mech rhino', expect: 'cut', cutReasons: ['no-home', 'not-grounded'] },
  { video_id: '4882', name: 'kaiju city destruction', expect: 'cut', cutReasons: ['not-grounded', 'not-brand-safe', 'no-home'] },
  { video_id: '4487', name: 'lightning-teleport superhuman combat', expect: 'cut', cutReasons: ['not-grounded', 'not-brand-safe', 'no-home'] },
  { video_id: '5256', name: 'jungle-horror creature feature', expect: 'cut', cutReasons: ['not-grounded', 'not-brand-safe', 'no-home'] },
  { video_id: '5425', name: 'astronaut-vs-alien horror chase', expect: 'cut', cutReasons: ['not-grounded', 'not-brand-safe', 'no-home'] },

  // ---- Must KEEP ----
  { video_id: '2147', name: 'ramen sprint (ALEXA 65 Tokyo — seed APX-C-001 source)', expect: 'keep' },
  { video_id: '4527', name: 'dessert world (one-bite fantasy — food-made world)', expect: 'keep' },
  { video_id: '4406', name: 'espresso matador (human-role transform)', expect: 'keep' },
  { video_id: '5071', name: 'cat chef (Michelin) — honest absurd comedy', expect: 'keep' },
  { video_id: '5141', name: 'Porsche motorsport lifestyle storyboard (aspirational, no dish)', expect: 'keep' },
  { video_id: '4577', name: 'spy rooftop chase (aspirational, no food at all)', expect: 'keep' },
  { video_id: '5380', name: 'Eid desert short film (cultural moment)', expect: 'keep' },
  { video_id: '5260', name: 'beach BBQ food-CM (genre-honest ad enthusiasm)', expect: 'keep' },
  { video_id: '288',  name: 'rural farmhouse kitchen ASMR', expect: 'keep' },
  { video_id: '1403', name: '80-yr-old rapper street MV (grounded, aspirational)', expect: 'keep' },
  { video_id: '2530', name: 'street racing night sequence (aspirational)', expect: 'keep' },
  { video_id: '747',  name: 'downhill skateboard FPV (anime-style, grounded sport)', expect: 'keep' },
  { video_id: '4051', name: 'puppy-rescue emotional montage', expect: 'keep' },
  { video_id: '2574', name: 'piano cat-and-mouse chase (honest comedy)', expect: 'keep' },
];
