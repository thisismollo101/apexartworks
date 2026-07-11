import Anthropic from '@anthropic-ai/sdk';
import type { GateVerdict } from './gate-rules';

/**
 * Decomposition — keeps only (cuts die whole and never reach this module).
 *
 * One LLM pass per keeper produces:
 *  - clip-level: title + client-safe summary + style fingerprint tags
 *  - shot rows: per beat, the exact verbatim prompt segment (INTERNAL IP)
 *    and a client-safe description, plus the internal recombination tags.
 *
 * Method per PRD §4: rows with explicit timecodes split on them; prose-only
 * rows are segmented into discrete beats by the model. Same pass either way.
 */

const MODEL = process.env.DECOMPOSE_MODEL || process.env.GATE_MODEL || 'claude-sonnet-5';

const DECOMPOSE_SYSTEM = `You decompose an AI-video generation prompt into the Apex clip library's two-layer structure. You are given the RAW PROMPT of a clip that has already passed the hospitality gate.

Produce:

1. "title" — a short, evocative, client-facing film title (e.g. "Still Hot — Tokyo Ramen Sprint"). Never prompt vocabulary.

2. "summary" — 1–3 sentences of plain English describing what happens in the film, written for a hospitality client. HARD RULES: no prompt vocabulary (no "whip-pan", no "ALEXA 65mm", no "8K", no timestamps-as-syntax, no render/lens/grade words), and never granular enough to reconstruct the prompt. Describe the moment, not the instruction.

3. "shots" — the clip decomposed into discrete beats, in order. If the prompt carries explicit timecodes (e.g. "0-4 seconds:", "4–9s"), split exactly on them and fill tc_in/tc_out in seconds. If it is prose-only, segment it into its natural beats (typically 3–8) and set tc_in/tc_out to -1. For each shot:
   - "verbatim_text": the EXACT substring of the raw prompt covering this beat — copy it verbatim, do not paraphrase, do not omit words. Every sentence of the prompt that describes on-screen action must land in exactly one shot's verbatim_text. (Global style/settings preambles that apply to the whole clip may be left out of shot segments.)
   - "description": a plain-English, client-safe account of the beat. Same hard rules as summary: no prompt vocabulary, never reconstructable.
   - internal tags (never shown to clients): subject_role, action, food_item, food_role, setting, camera_framing, camera_angle, camera_movement, motion_speed, lighting, vfx, mood. Use the vocabulary given in the schema; use "none" when absent; food_item is free text ("ramen", "none").

4. clip-level style fingerprint (internal): realism_level, render_stack (lens/format/grain notes as free text, may be ""), grade, motion_feel, runtime_s (total seconds if derivable from timecodes or an explicit duration, else -1), aspect_ratio ("16:9" | "9:16" | "2.39:1" | "1:1" | "unknown").

Respond ONLY with the JSON.`;

const SHOT_SCHEMA = {
  type: 'object' as const,
  properties: {
    verbatim_text: { type: 'string' as const },
    description: { type: 'string' as const },
    tc_in: { type: 'number' as const },
    tc_out: { type: 'number' as const },
    subject_role: { enum: ['chef', 'courier', 'barista', 'guest', 'driver', 'agent', 'animal-character', 'family', 'none'] },
    action: { type: 'string' as const, description: 'semicolon-separated from: sprinting|leaping|sliding|garnishing|serving|pouring|plating|flipping|searing|chopping|frothing|biting|vaulting|driving|racing|praying|feasting|tug-of-war|none' },
    food_item: { type: 'string' as const },
    food_role: { enum: ['hero', 'featured', 'incidental', 'none'] },
    setting: { type: 'string' as const },
    camera_framing: { enum: ['ecu', 'cu', 'medium', 'wide', 'extreme-wide', 'none'] },
    camera_angle: { enum: ['low', 'eye', 'high', 'overhead', 'dutch', 'pov', 'none'] },
    camera_movement: { type: 'string' as const, description: 'semicolon-separated from: drone|orbit|tracking|whip-pan|push-in|pull-back|crane|fpv|handheld|static|rack-focus|tilt|none' },
    motion_speed: { enum: ['real-time', 'slow-mo', 'bullet-time', 'speed-ramp', 'time-remap', 'mixed', 'none'] },
    lighting: { type: 'string' as const },
    vfx: { type: 'string' as const, description: 'semicolon-separated from: steam|sparks|particles|fire|lens-flare|shatter|energy|water|none' },
    mood: { enum: ['intense', 'playful', 'reverent', 'appetising', 'epic', 'calm', 'comedic', 'awe', 'none'] },
  },
  required: ['verbatim_text', 'description', 'tc_in', 'tc_out', 'subject_role', 'action', 'food_item', 'food_role', 'setting', 'camera_framing', 'camera_angle', 'camera_movement', 'motion_speed', 'lighting', 'vfx', 'mood'],
  additionalProperties: false,
};

const DECOMPOSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string' as const },
    summary: { type: 'string' as const },
    runtime_s: { type: 'number' as const },
    aspect_ratio: { enum: ['16:9', '9:16', '2.39:1', '1:1', 'unknown'] },
    realism_level: { enum: ['photoreal', 'stylized-real', '3d-animation', '2.5d-hybrid', 'macro-stopmotion'] },
    render_stack: { type: 'string' as const },
    grade: { enum: ['teal-orange', 'warm-amber', 'cold-blue', 'neon-magenta', 'golden-hour', 'mixed', 'none'] },
    motion_feel: { enum: ['24fps-cinematic', 'high-fps-slowmo', 'mixed'] },
    shots: { type: 'array' as const, items: SHOT_SCHEMA },
  },
  required: ['title', 'summary', 'runtime_s', 'aspect_ratio', 'realism_level', 'render_stack', 'grade', 'motion_feel', 'shots'],
  additionalProperties: false,
};

export type DecomposedShot = {
  verbatim_text: string;
  description: string;
  tc_in: number;
  tc_out: number;
  subject_role: string;
  action: string;
  food_item: string;
  food_role: string;
  setting: string;
  camera_framing: string;
  camera_angle: string;
  camera_movement: string;
  motion_speed: string;
  lighting: string;
  vfx: string;
  mood: string;
};

export type Decomposition = {
  title: string;
  summary: string;
  runtime_s: number;
  aspect_ratio: string;
  realism_level: string;
  render_stack: string;
  grade: string;
  motion_feel: string;
  shots: DecomposedShot[];
};

let client: Anthropic | null = null;
function api(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 5 });
  return client;
}

/** Words that must never appear in client-facing text (PRD §4/§5). */
const PROMPT_VOCAB = /\b(whip[- ]?pan|alexa|arri|8k|4k|anamorphic|dolby|hdr|lens flare|film grain|fps|slow[- ]?mo(tion)?\b.*\bshot|push[- ]?in|pull[- ]?back|rack[- ]?focus|ecu\b|close[- ]?up shot|tracking shot|drone shot|pov shot|volumetric)\b/i;

export function clientTextWarnings(d: Decomposition): string[] {
  const warnings: string[] = [];
  if (PROMPT_VOCAB.test(d.summary)) warnings.push(`summary contains prompt vocabulary`);
  d.shots.forEach((s, i) => {
    if (PROMPT_VOCAB.test(s.description)) warnings.push(`shot ${i + 1} description contains prompt vocabulary`);
  });
  return warnings;
}

export async function decomposePrompt(
  rawPrompt: string,
  hasTimecode: boolean,
  gate: GateVerdict,
): Promise<Decomposition> {
  const response = await api().messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [
      { type: 'text', text: DECOMPOSE_SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } },
    ],
    // medium effort: segmentation + description writing doesn't need deep
    // reasoning, and it substantially cuts thinking-token spend per clip
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: DECOMPOSE_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content:
          `has_timecode: ${hasTimecode}\n` +
          `register (from the gate, for tone): ${gate.register}\n\n` +
          `<prompt>\n${rawPrompt}\n</prompt>`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('decompose refusal — this row should have been cut at the gate; flag for review');
  }
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error(`no text block (stop: ${response.stop_reason})`);
  const d = JSON.parse(text.text) as Decomposition;
  if (!d.shots.length) throw new Error('decomposition produced zero shots');
  return d;
}
