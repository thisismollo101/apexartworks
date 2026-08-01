/**
 * Deterministic title + summary — the zero-API replacement for the part of
 * decompose.ts that wrote them.
 *
 * The 106-entry README collection carried its own title and summary, so the
 * v2 import never needed this. The main library does: data/apex_source_library.csv
 * has 3,415 clean prompts and NO title or summary for any of them. The 766
 * clips already loaded got theirs from a model, at API cost. The ruling is that
 * no budget is spent, so these are derived from the prompt text itself.
 *
 * BE HONEST ABOUT THE SEAM. A model wrote "Still Hot — Tokyo Ramen Sprint" for
 * clip 001. Rules cannot invent that; they can only surface what the prompt
 * already says. Derived titles read plainer and more literal, and next to the
 * model-written ones the difference is visible. That is the real cost of the
 * constraint, and it belongs in the open rather than buried.
 *
 * What makes it tractable: these prompts open by describing the film. The work
 * is separating that description from the direction wrapped around it —
 * "REFERENCE IMAGE:", "camera:", "Sound:", render jargon, bare emoji — none of
 * which describe anything a viewer would see.
 */

/* ------------------------------------------------------------------ *
 * 1. Finding the lines that actually describe the film
 * ------------------------------------------------------------------ */

/**
 * A line that instructs the generator rather than describing the film. These
 * are keyed on a leading label + colon, which is how the corpus writes them;
 * a colon later in a descriptive sentence is left alone.
 */
const DIRECTIVE_LINE =
  /^\s*[*_#>\-\s]*(?:reference (?:image|video)|replicate|use the provided|camera|camera movement|camera angle|shot list|shot type|framing|lens|sound|audio|sfx|music|voice ?over|vo|narration|subtitles?|text overlay|style|overall style|visual style|art style|duration|length|aspect ratio|resolution|quality|render|negative prompts?|technical requirements?|requirements?|notes?|format|editing|transitions?|lighting|colou?r (?:grade|palette)|palette|grading|prompt|task|goal|objective|instructions?|output|model|seed|language|watermark|logo|title card)\s*[:：]/i;

/**
 * Direction addressed to the generator that carries no colon to key on —
 * "Replicate motion effect from reference video and create a video…". These
 * describe the JOB, not the film, so a title built from one names nothing.
 */
const META_INSTRUCTION_LINE =
  /^\s*[*_#>\-\s]*(?:replicate|recreate|reproduce|copy|use|using|follow|maintain|keep|apply|match)\b[^.]{0,80}?\b(?:reference|provided|attached|above|same|source)\b/i;

/**
 * A bare label the author put in front of real description — "CONCEPT: …",
 * "LOGLINE: …". The label is furniture; what follows it is the film.
 */
const LEADING_LABEL =
  /^\s*(?:concept|idea|logline|premise|synopsis|summary|title|theme|brief|story|scenario|setup|subject|topic|description|action(?:\s*\/\s*expression)?|expression|visuals?|details?|atmosphere|movement|focus|key moment|core burst point)\s*[:：]\s*/i;

/**
 * A section header standing on its own line — "[Style]", "【场景】", "Scene:".
 * These prompts are commonly written as blocks, so the direction is not on the
 * labelled line at all; it is on the lines UNDER it. Matching only "label:"
 * text would let an entire [Style] block through as if it described the film.
 */
const SECTION_HEADER =
  /^\s*[[(【]?\s*([A-Za-z][A-Za-z /&-]{1,34}?)\s*[\])】]?\s*[:：]?\s*$/;

/** Sections that direct the generator. Their whole block is skipped. */
const DIRECTIVE_SECTION =
  /^(?:overall |visual |art |global )?(?:style|styling|camera|camera ?work|cinematography|audio|sound|sound ?design|sfx|music|voice ?over|narration|dialogue|subtitles?|text|typography|duration|length|timing|aspect ratio|resolution|format|quality|render(?:ing)?|technical(?: requirements?)?|requirements?|negative(?: prompts?)?|constraints?|notes?|editing|transitions?|lighting|colou?r(?: grade| palette| grading)?|grading|palette|reference|prompt|instructions?|output|model|seed|parameters?|settings?)$/i;

/** Nothing but punctuation, emoji or box-drawing — carries no description. */
const NON_TEXTUAL_LINE = /^[^\p{L}\p{N}]*$/u;

/** A line that is only a beat marker: "[00:00-00:05]", "0-3s —", "Shot 2:". */
const MARKER_ONLY_LINE =
  /^\s*[[(【]?\s*(?:shot|scene|act|part|cut)?\s*\d{0,3}\s*[:.]?\s*\d{0,2}\s*(?:[-–—]\s*\d{1,2}[:.]?\d{0,2}\s*)?(?:s|secs?|seconds?)?\s*[\])】]?\s*[-–—:]*\s*(?:HOOK|hook)?\s*$/;

/** Markdown emphasis, list bullets and stray quoting around a real line. */
const stripDecoration = (line: string) =>
  line
    .replace(/^\s*[*_#>\-•]+\s*/, '')
    .replace(/[*_`]+/g, '')
    .replace(/^\s*["“”'']+/, '')
    .replace(/["“”'']+\s*$/, '')
    .trim();

/**
 * The descriptive lead of a prompt: its lines with the direction removed,
 * stopping once enough prose is gathered to build a summary from.
 */
export function descriptiveLines(prompt: string, max = 12): string[] {
  const out: string[] = [];
  // True while inside a block whose header marked it as direction, e.g. every
  // line under "[Style]" until the next header.
  let skippingSection = false;
  for (const raw of prompt.split(/\r?\n/)) {
    if (out.length >= max) break;
    if (NON_TEXTUAL_LINE.test(raw)) continue;

    const header = SECTION_HEADER.exec(stripDecoration(raw));
    if (header) {
      skippingSection = DIRECTIVE_SECTION.test(header[1].trim());
      continue; // the header itself never describes anything
    }
    if (skippingSection) continue;

    if (DIRECTIVE_LINE.test(raw)) continue;
    if (META_INSTRUCTION_LINE.test(raw)) continue;
    if (MARKER_ONLY_LINE.test(raw)) continue;
    const line = stripDecoration(raw).replace(LEADING_LABEL, '');
    // A beat marker can also open a descriptive line ("0–3s — A warrior
    // sprints…"); keep the description, drop the marker.
    const shorn = line
      .replace(
        /^\s*[[(【]?\s*(?:shot|scene|act|part|cut)\s*\d{1,3}\s*[\])】]?\s*[-–—:.]*\s*/i,
        '',
      )
      .replace(
        /^\s*[[(【]?\s*\d{1,3}(?:[:.]\d{2})?\s*[-–—]\s*\d{1,3}(?:[:.]\d{2})?\s*(?:s|secs?|seconds?)?\s*[\])】]?\s*[-–—:.]*\s*/i,
        '',
      )
      .replace(/^(?:HOOK|hook)\s*[-–—:.]*\s*/, '')
      .trim();
    if (shorn.length < 12) continue; // fragments carry no description
    if (!/\p{L}/u.test(shorn)) continue;
    out.push(shorn);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. Title
 * ------------------------------------------------------------------ */

/**
 * Leading qualifiers that describe the RENDER, not the film. "15-second
 * cinematic ultra-realistic street race" is a street race. Stripped only from
 * the front of the phrase, so "cinematic" inside a real clause survives.
 */
const LEAD_QUALIFIER =
  /^(?:\d{1,3}\s*[-–—]?\s*(?:second|sec|s)\b|\d{1,2}\s*[:：]\s*\d{1,2}\b|(?:horizontal|vertical|portrait|landscape)?\s*screen\b|mv style|ultra[-\s]?realistic|hyper[-\s]?realistic|photo[-\s]?realistic|realistic|cinematic|filmic|blockbuster|epic|dramatic|stunning|beautiful|gorgeous|breathtaking|high[-\s]?quality|professional|award[-\s]?winning|4k|8k|hd|uhd|3d|2d|cgi|animated|animation|live[-\s]?action|vertical|horizontal|widescreen|slow[-\s]?motion|a|an|the|this is|video of|footage of|shot of|clip of|scene of|create|generate|make|show)\b[\s,:-]*/i;

/** Small words that stay lowercase inside a title. */
/**
 * A title must not end on a word that was leading somewhere — truncation and
 * clause-splitting both leave these behind ("…and Create a", "…Showing a").
 */
const DANGLING_TAIL =
  /[\s,;:—–-]+(?:a|an|the|and|or|of|in|on|at|for|with|to|from|by|as|into|over|under|through|across|that|which|who|whose|while|when|is|are|was|were|be|being|has|have|had|showing|shows|featuring|features|depicting|set|about|during)$/i;

const trimDangling = (phrase: string) => {
  let out = phrase.replace(/[\s,;:—–-]+$/, '');
  for (let i = 0; i < 4; i++) {
    const next = out.replace(DANGLING_TAIL, '');
    if (next === out) break;
    out = next;
  }
  return out;
};

const MINOR = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'for', 'with', 'to',
  'from', 'by', 'as', 'into', 'over', 'under', 'above', 'through', 'across',
]);

/**
 * Title-case a phrase without flattening words the prompt already capitalised
 * (proper nouns like "Tokyo", "Champions League", acronyms like "GT3").
 */
const titleCase = (phrase: string) =>
  phrase
    .split(/\s+/)
    .map((w, i) => {
      if (/[A-Z]/.test(w.slice(1))) return w; // already-capitalised / acronym
      const lower = w.toLowerCase();
      if (i > 0 && MINOR.has(lower.replace(/[^\p{L}]/gu, ''))) return lower;
      return lower.replace(/\p{L}/u, (c) => c.toUpperCase());
    })
    .join(' ');

const TITLE_MAX = 58;

/**
 * The film's subject, as a short phrase. Takes the opening clause of the first
 * descriptive line, drops the render qualifiers, and trims to a clean word
 * boundary — never mid-word, and never with a dangling comma.
 */
export function deriveTitle(prompt: string): string {
  const lines = descriptiveLines(prompt, 4);
  if (lines.length === 0) return 'Untitled Film';

  let phrase = lines[0];
  // Peel qualifiers repeatedly: "15-second cinematic ultra-realistic …".
  for (let i = 0; i < 6; i++) {
    const next = phrase.replace(LEAD_QUALIFIER, '');
    if (next === phrase) break;
    phrase = next;
  }

  // The first clause is the subject; later clauses are elaboration.
  phrase = phrase.split(/[,.;:—–]|\s+\bwith\b\s+|\s+\bwhile\b\s+/)[0].trim();

  // Too thin to name a film by — fall back to the whole first line, cleaned.
  if (phrase.length < 10) {
    phrase = lines[0].replace(LEAD_QUALIFIER, '').split(/[.;]/)[0].trim();
  }

  if (phrase.length > TITLE_MAX) {
    const cut = phrase.slice(0, TITLE_MAX);
    const lastSpace = cut.lastIndexOf(' ');
    phrase = (lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim();
  }
  phrase = trimDangling(phrase);
  // Clause-splitting can cut between a pair of quotes, leaving one hanging:
  // Visualizing "Smell. An unmatched quote reads as a typo, so drop them all.
  if (((phrase.match(/"/g) ?? []).length) % 2 === 1) phrase = phrase.replace(/"/g, '').trim();
  if (phrase.length < 3) return 'Untitled Film';
  return titleCase(phrase);
}

/* ------------------------------------------------------------------ *
 * 3. Summary
 * ------------------------------------------------------------------ */

const SUMMARY_MAX = 300;

/**
 * Format direction an inline prompt opens with — "16:9 horizontal screen,",
 * "15-second,", "4K,". Narrower than LEAD_QUALIFIER on purpose: that one also
 * strips articles, which is right for a title but would turn the summary
 * "A lone man stands in a boat" into "lone man stands in a boat".
 */
const LEAD_FORMAT =
  /^(?:\d{1,2}\s*[:：]\s*\d{1,2}|\d{1,3}\s*[-–—]?\s*(?:seconds?|secs?|s)\b|(?:horizontal|vertical|portrait|landscape)\s*(?:screen|video|format)?|screen|widescreen|4k|8k|uhd|hd)\b\s*[,.;:—–-]*\s*/i;

/** Render jargon that reads as noise in a client-facing sentence. */
const JARGON =
  /\b(?:(?:ultra|photo|hyper)[-\s]?realistic(?:\s+quality)?|8k|4k|uhd|hdr|ray[-\s]?traced|unreal engine\s*\d*|octane render|depth of field|bokeh|anamorphic|film grain|colou?r graded|shallow focus|high fidelity|award[-\s]?winning|masterpiece|best quality|highly detailed|intricate detail)\b[,;/\s]*/gi;

/**
 * A client-facing blurb: the opening description, jargon stripped, cut at a
 * sentence boundary. Deliberately the prompt's own words — paraphrasing is
 * exactly the judgement a model would be needed for.
 */
export function deriveSummary(prompt: string): string | null {
  const lines = descriptiveLines(prompt, 8);
  if (lines.length === 0) return null;

  let lead = lines.join(' ');
  for (let i = 0; i < 4; i++) {
    const next = lead.replace(LEAD_FORMAT, '');
    if (next === lead) break;
    lead = next;
  }

  const prose = lead
    .replace(JARGON, '')
    // Removing jargon mid-sentence strands its punctuation: "cinematic,
    // ultra-realistic quality, warm light" must not become ", , warm light".
    .replace(/([,;:])\s*(?=[,;:])/g, '')
    .replace(/^[\s,;:.-]+/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()
    // Prompts often open lowercase ("cinematic street racing sequence…");
    // a client-facing blurb should not.
    .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  if (prose.length < 20) return null;
  if (prose.length <= SUMMARY_MAX) return prose;

  // Prefer ending on a sentence; fall back to a word boundary + ellipsis.
  const window = prose.slice(0, SUMMARY_MAX);
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  if (lastStop > 120) return window.slice(0, lastStop + 1).trim();
  const lastSpace = window.lastIndexOf(' ');
  return `${window.slice(0, lastSpace > 120 ? lastSpace : SUMMARY_MAX).replace(/[\s,;:]+$/, '')}…`;
}

export const deriveHeadline = (prompt: string) => ({
  title: deriveTitle(prompt),
  summary: deriveSummary(prompt),
});
