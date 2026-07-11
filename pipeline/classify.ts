import Anthropic from '@anthropic-ai/sdk';
import {
  GATE_SYSTEM_PROMPT,
  GATE_OUTPUT_SCHEMA,
  type GateVerdict,
} from './gate-rules';

/**
 * The Gate classifier — one Claude API call per raw prompt.
 *
 * - claude-sonnet-5 (override with GATE_MODEL); adaptive thinking is the
 *   model default. Sonnet 5 rejects sampling params, so none are sent.
 * - The rules block is prompt-cached (1h TTL) — it is byte-identical across
 *   all ~3.4k calls, so every call after the first reads it from cache.
 * - Structured output via output_config.format guarantees parseable JSON
 *   matching GATE_OUTPUT_SCHEMA.
 */

const MODEL = process.env.GATE_MODEL || 'claude-sonnet-5';

let client: Anthropic | null = null;
function api(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY must be set');
    client = new Anthropic({ maxRetries: 5 });
  }
  return client;
}

function normalize(v: GateVerdict): GateVerdict {
  v.confidence = Math.max(0, Math.min(1, v.confidence));
  // The floor is absolute: a floor failure is always a cut, whatever else
  // the model filled in. Belt and braces — never let a floor fail leak.
  if (!v.floor_pass) {
    v.verdict = 'cut';
    v.cut_reason = 'floor-child-safety';
  }
  if (v.verdict === 'cut' && v.cut_reason === 'none') v.cut_reason = 'no-home';
  if (v.verdict === 'keep') v.cut_reason = 'none';
  return v;
}

export async function gatePrompt(rawPrompt: string): Promise<GateVerdict> {
  const response = await api().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: GATE_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ],
    output_config: { format: { type: 'json_schema', schema: GATE_OUTPUT_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Gate this AI-video prompt:\n\n<prompt>\n${rawPrompt}\n</prompt>`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    // The API itself declined to process this prompt — treat as the hardest
    // possible floor signal. Err to cut (PRD: on anything child-adjacent,
    // low confidence cuts).
    return normalize({
      floor_pass: false,
      step1: 'fail',
      step2_home_route: 'none',
      step3: 'fail',
      verdict: 'cut',
      cut_reason: 'floor-child-safety',
      distinctiveness: 'none',
      register: 'none',
      ip_flag: false,
      confidence: 1,
      note: 'API safety refusal — treated as floor cut',
    });
  }

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error(`no text block (stop: ${response.stop_reason})`);
  return normalize(JSON.parse(text.text) as GateVerdict);
}

/** Simple bounded-concurrency pool. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export { MODEL as GATE_MODEL_RESOLVED };
