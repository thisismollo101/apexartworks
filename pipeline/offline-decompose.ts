/**
 * Deterministic decomposition — the zero-API replacement for decompose.ts.
 *
 * pipeline/decompose.ts asks a model to break a prompt into shots and write
 * client-safe descriptions. That costs money per clip, and the ruling for this
 * import is that no API budget is spent. So this does the same job from the
 * prompt's own structure.
 *
 * What the source already gives us, so no model is needed:
 *   - title and summary come straight from the collection's own markdown
 *   - most prompts number their own beats ("[00:00-00:05]", "0-4 seconds:",
 *     "Shot 3", "Scene 2"), so the shot split is a parse, not a judgement
 *
 * What it cannot do as well as the model: shot `description`. The model wrote
 * fresh prose; this strips the camera and render jargon out of the beat and
 * keeps the prose that is left. The result reads more mechanically. That is
 * the visible cost of the zero-API constraint, and it is worth stating plainly
 * rather than hiding — but the field cannot be left empty: client_shots
 * exposes it, ShotSelector renders it, and searchClips() matches on it.
 *
 * Internal tags are populated ONLY where they earn their keep. Six of them —
 * setting, food_item, food_role, subject_role, action, mood — are read by
 * 0004_categories.sql and 0008_hero_based_categories.sql to derive the browse
 * facets, so they must be right. The camera fields have no client consequence
 * at all and are left 'none'.
 */

/* ------------------------------------------------------------------ *
 * 1. Splitting a prompt into beats
 * ------------------------------------------------------------------ */

export type Beat = { text: string; tc_in: number; tc_out: number };

/** "[00:00-00:05]", "0:00–0:02", "00:05-00:10" — a real timecode range. */
const TC_RANGE = /\[?\s*(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})\s*\]?/;
/** "0-4 seconds:", "(0-2s)", "13.5-15s", "0:00–0:03" in seconds-only form. */
const SEC_RANGE = /\(?\s*(\d{1,3}(?:\.\d)?)\s*(?:[-–—]|to)\s*(\d{1,3}(?:\.\d)?)\s*(?:seconds?|secs?|s)\b\s*\)?/i;
/** "Shot 1", "Scene 2:", "Act 3", "Part 1" — structure without timing. */
const SCENE_MARK = /^\s*(?:\[|【)?\s*(?:Shot|Scene|Act|Part|Cut)\s*\d+/i;

/** Global direction that belongs to no single beat and must not become one. */
const GLOBAL_BLOCK =
  /^\s*(?:\[|【)?\s*(?:Style|Overall Style|Duration|Aspect Ratio|Scene|Setting|Character(?:s| ID)?|Technical Requirements?|Negative Prompts?|Audio|Sound Effects?|Notes?|Visual Style|Camera|Editing|Format|Condition Definition|Core Focus|Reference Lock)\s*(?:\]|】)?\s*[:：]?\s*$/i;

const toSeconds = (m: RegExpMatchArray, a: number, b: number) =>
  Number(m[a]) * 60 + Number(m[b]);

/**
 * Split on the prompt's own beat markers. Lines are scanned for a marker; a
 * marker opens a new beat and everything until the next marker belongs to it.
 * Text before the first marker is global direction (style, characters, scene)
 * and is deliberately dropped from the shots — it stays whole in
 * clips.verbatim_prompt, which the clip page already shows as one block.
 */
export function splitBeats(prompt: string): Beat[] {
  const lines = prompt.split(/\r?\n/);
  const beats: Beat[] = [];
  let current: Beat | null = null;

  // Takes the beat as an argument rather than closing over `current`: a
  // closure that assigns it would stop the compiler tracking the variable
  // through the loop.
  const close = (beat: Beat | null) => {
    if (beat && beat.text.trim()) beats.push(beat);
  };

  for (const line of lines) {
    if (GLOBAL_BLOCK.test(line)) {
      close(current);
      current = null;
      continue;
    }
    const tc = TC_RANGE.exec(line);
    const sec = tc ? null : SEC_RANGE.exec(line);
    if (tc && tc.index < 40) {
      close(current);
      current = {
        text: line.slice(tc.index + tc[0].length),
        tc_in: toSeconds(tc, 1, 2),
        tc_out: toSeconds(tc, 3, 4),
      };
    } else if (sec && sec.index < 40) {
      close(current);
      current = {
        text: line.slice(sec.index + sec[0].length),
        tc_in: Number(sec[1]),
        tc_out: Number(sec[2]),
      };
    } else if (SCENE_MARK.test(line)) {
      close(current);
      current = { text: line.replace(SCENE_MARK, ''), tc_in: -1, tc_out: -1 };
    } else if (current) {
      current.text += `\n${line}`;
    }
  }
  close(current);

  // Inline prompts put every beat on one line: "0-3s: … 3-6s: … 6-9s: …".
  if (beats.length < 2) {
    const inline = splitInline(prompt);
    if (inline.length >= 2) return inline;
  }
  return beats.filter((b) => b.text.trim().length > 20);
}

/** The same markers, but mid-sentence rather than at the start of a line. */
function splitInline(prompt: string): Beat[] {
  const marker =
    /(\[?\s*\d{1,2}[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}\s*\]?|\(?\s*\d{1,3}(?:\.\d)?\s*(?:[-–—]|to)\s*\d{1,3}(?:\.\d)?\s*(?:seconds?|secs?|s)\b\s*\)?)\s*[:：]?/gi;
  const parts: Beat[] = [];
  let last: { idx: number; tc_in: number; tc_out: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(prompt))) {
    const tc = TC_RANGE.exec(m[1]);
    const sec = tc ? null : SEC_RANGE.exec(m[1]);
    const tc_in = tc ? toSeconds(tc, 1, 2) : sec ? Number(sec[1]) : -1;
    const tc_out = tc ? toSeconds(tc, 3, 4) : sec ? Number(sec[2]) : -1;
    if (last) parts.push({ text: prompt.slice(last.idx, m.index), tc_in: last.tc_in, tc_out: last.tc_out });
    last = { idx: m.index + m[0].length, tc_in, tc_out };
  }
  if (last) parts.push({ text: prompt.slice(last.idx), tc_in: last.tc_in, tc_out: last.tc_out });
  return parts.filter((b) => b.text.trim().length > 20);
}

/**
 * Fallback for prose prompts with no markers at all: group sentences into
 * beats of roughly 220–360 characters, never splitting a sentence. Timecodes
 * are -1, exactly as the model pipeline records prose-only clips.
 */
export function groupSentences(prompt: string, max = 6): Beat[] {
  const sentences = prompt
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/)
    .filter((s) => s.trim().length > 0);
  if (!sentences.length) return [];
  const target = Math.max(220, Math.ceil(prompt.length / max));
  const beats: Beat[] = [];
  let buf = '';
  for (const s of sentences) {
    buf = buf ? `${buf} ${s}` : s;
    if (buf.length >= target && beats.length < max - 1) {
      beats.push({ text: buf, tc_in: -1, tc_out: -1 });
      buf = '';
    }
  }
  if (buf.trim()) beats.push({ text: buf, tc_in: -1, tc_out: -1 });
  return beats;
}

/* ------------------------------------------------------------------ *
 * 2. Turning a beat into a client-safe description
 * ------------------------------------------------------------------ */

/** Whole clauses that are pure specification and describe nothing on screen. */
const SPEC_CLAUSE =
  /^\s*(?:\[[^\]]*\]|【[^】]*】)?\s*(?:camera(?: position| angle| specs?| movement)?|lens|visuals?|style|duration|format|resolution|lighting|audio|sound(?: effects?| design)?|sfx|bgm|music|technical requirements?|negative prompts?|notes?|aspect ratio|special effects? details?|physical feedback|editing|colou?r grade|end text)\s*[:：]/i;

/**
 * Instructions aimed at the generator rather than the viewer. These are very
 * common in this collection ("Use the uploaded reference image…", "Maintain
 * identical facial identity…") and describe nothing that appears on screen,
 * so they must never become a shot description.
 */
const GENERATOR_DIRECTION =
  /\b(?:use|refer to|according to) (?:the )?(?:uploaded |attached |reference |same )?(?:image|images|storyboard|photo|bottle|product|character)\b|\bidentical (?:branding|packaging|label)\b|^\s*(?:create|generate|produce|design|make)\b(?![^.]*\b(?:she|he|they|woman|man|girl|boy)\b)|\breference image\b|\bcharacter reference\b|\b(?:preserve|maintain|keep|ensure)\b[^.]{0,80}\b(?:identity|consistency|consistent|proportions|unchanged|throughout every shot|identical)\b|\bnegative prompts?\b|\bno (?:text|subtitles?|watermarks?|logos?|distorted)\b|\b@?[Ii]mage\s?\d\b|\bidentity lock\b|\bstrictly maintain(?:ing)?\b/i;

/** Jargon removed from clauses that are otherwise real description. */
const JARGON = new RegExp(
  [
    // resolution, frame rate, format
    String.raw`\b\d+\s?k\b(?!\w)`, String.raw`\b\d{2,3}\s?fps\b`, String.raw`\bHDR\b`, String.raw`\bSDR\b`,
    String.raw`\b\d{1,2}:\d{1,2}\s*(?:aspect ratio|widescreen|vertical|horizontal)?\b`,
    String.raw`\b(?:16:9|9:16|2\.39:1|1:1|4:3)\b`,
    // cameras, lenses, stock
    String.raw`\b(?:ARRI|Alexa(?: Mini| 35| 65)?|RED\b|Sony A7S3|IMAX(?: 70mm)?|Cooke S7/?i|Atlas Orion|Kodak Vision3|Hi8|VHS-?C?|DV\b|16mm|35mm|70mm|8mm)\b`,
    String.raw`\b(?:anamorphic|telephoto|macro lens|\d{2,3}mm(?: lens| prime)?|prime lens|wide[- ]angle lens|fisheye)\b`,
    // shot grammar
    // Leading intensifiers are swallowed with the term, so "extreme macro
    // shot" leaves nothing behind rather than a dangling "extreme".
    String.raw`\b(?:extreme|ultra|super|slow|fast|quick|tight|loose|smooth|static|fixed|long|short)?[\s-]*(?:close[- ]?up|wide|medium|full[- ]body|low[- ]angle|high[- ]angle|overhead|aerial|drone|POV|first[- ]person|three[- ]quarter|two[- ]shot|establishing|insert|macro|telephoto|side|frontal|orbit(?:ing)?|surrounding)\s+(?:shot|angle|view|framing|sequence|perspective|tracking)\b`,
    String.raw`\b(?:whip[- ]?pan|rack[- ]?focus|push[- ]?in|pull[- ]?back|dolly(?:[- ]in| out|[- ]zoom)?|gimbal|steadicam|handheld|tracking|panning|tilt(?:s|ing)? (?:up|down)|crane|orbit(?:s|ing)?|zoom(?:s|ing)?(?: in| out)?)\b`,
    String.raw`\b(?:shallow )?depth of field\b`, String.raw`\bbokeh\b`, String.raw`\bfilm grain\b`,
    String.raw`\blens flares?\b`, String.raw`\bvolumetric\b`, String.raw`\bmotion blur\b`,
    String.raw`\bcolou?r grad(?:e|ing)\b`, String.raw`\bcolou?r palette\b`,
    // quality incantations
    String.raw`\b(?:ultra[- ])?(?:photo)?realistic\b`, String.raw`\bphotoreal\b`, String.raw`\bhyper[- ]realistic\b`,
    String.raw`\bcinematic(?:ally)?\b`, String.raw`\bmasterpiece\b`, String.raw`\bhighly detailed\b`,
    String.raw`\bultra[- ](?:clear|detailed|high definition)\b`, String.raw`\b(?:premium|commercial|broadcast)[- ]grade\b`,
    String.raw`\bhigh[- ]speed photography\b`, String.raw`\bslow[- ]?mo(?:tion)?\b`, String.raw`\bsuper slow-?mo\b`,
    String.raw`\bno (?:text|subtitles?|watermarks?|logos?)\b`,
  ].join('|'),
  'gi',
);

/**
 * Style laundry lists — "warm lantern light, vintage film texture, subtle film
 * grain, soft depth of field, premium colour grading, photorealistic". They are
 * grammatical prose, so no single pattern catches them; three or more style
 * words in one clause does.
 */
const STYLE_WORD =
  /\b(?:cinematic|lighting|texture|grade|grading|aesthetic|quality|rendering|render|detailed|realistic|atmosphere|tone|palette|composition|framing|saturation|contrast|exposure|shadows?|highlights?|reflections?|ambience|vibe|look)\b/gi;

const isStyleLaundry = (clause: string) => (clause.match(STYLE_WORD) ?? []).length >= 3;

/**
 * Something happening to someone. Used to PREFER real description over spec:
 * when a beat has any clause with an actor in it, only those clauses are kept.
 * That is what stops "Create an ultra-realistic premium UGC commercial" from
 * becoming the shot description of a film about a woman opening a bottle.
 */
const ACTOR =
  /\b(?:she|he|they|her|his|their|him|the (?:woman|man|girl|boy|child|chef|barista|creator|model|player|rider|driver|couple|friends?|character|camera|hand|hands)|a (?:woman|man|girl|boy|young|small|group))\b/i;

/** Labels that introduce real description — drop the label, keep the content. */
const CONTENT_LABEL = /\b(?:action|effect|details?|atmosphere|visuals?)\s*[:：]\s*/gi;

const TIDY: [RegExp, string][] = [
  // A clause that opened with camera direction ("Slow smooth push-in, she
  // stands…") is left headless once the jargon goes — drop to the comma.
  [/^(?:\s*(?:slow|fast|smooth|quick|steady|gentle|rapid|sharp|hard|soft|low|high|tight)\b[^,.]{0,24}){1,3},\s*/i, ''],
  // Prepositions and articles orphaned by a removed noun phrase.
  [/\b(?:cut|switch|transition|move|push|pull)\s+(?:to|into|back to)\s+(?:a|an|the)?\s*(?=[,.;]|\band\b|$)/gi, ''],
  [/\b(?:a|an|the|with|in|on|of|to|into)\s*(?=[,.;])/g, ''],
  // "Move into an as she twists…" — the whole verb phrase is orphaned once its
  // object ("an extreme macro shot") has gone.
  [/\b(?:move|cut|switch|transition|push|pull|shift)\s+(?:into|to|back to)\s+(?:a|an|the)?\s*(?=(?:as|when|while)\b)/gi, ''],
  [/\b(?:a|an|the)\s+(?=(?:as|when|while|and|then|of)\b)/gi, ''],
  [/\s*[,;]\s*(?=[,;])/g, ''],
  [/\s{2,}/g, ' '],
  [/\s+([,.;:!?])/g, '$1'],
  [/^[\s,;:.\-–—•*]+/, ''],
  [/[\s,;:\-–—]+$/, ''],
];

/**
 * Strip a beat down to what a viewer would actually see, and stop at a
 * sentence boundary. Deliberately conservative: when a clause is mostly spec,
 * it is dropped whole rather than half-cleaned into nonsense.
 */
export function toDescription(beat: string, limit = 240): string {
  const clauses = beat
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => !SPEC_CLAUSE.test(c) && !GENERATOR_DIRECTION.test(c) && !isStyleLaundry(c));

  // Positive selection beats negative filtering here: if anything in this beat
  // describes a person doing something, that is the shot — the rest is setup.
  const withActor = clauses.filter((c) => ACTOR.test(c));
  const candidates = withActor.length ? withActor : clauses;

  const cleaned: string[] = [];
  for (const c of candidates) {
    let s = c.replace(CONTENT_LABEL, '').replace(JARGON, '');
    for (const [re, to] of TIDY) s = s.replace(re, to);
    // A clause that was mostly jargon is not worth salvaging.
    if (s.length < 25 || s.length < c.length * 0.35) continue;
    cleaned.push(s);
    if (cleaned.join(' ').length >= limit) break;
  }

  let out = cleaned.join(' ').trim();
  if (!out) return '';
  if (out.length > limit) {
    const cut = out.slice(0, limit);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    out = stop > limit * 0.5 ? cut.slice(0, stop + 1) : `${cut.replace(/[\s,;]+\S*$/, '')}…`;
  }
  out = out.charAt(0).toUpperCase() + out.slice(1);
  return /[.!?…]$/.test(out) ? out : `${out}.`;
}

/* ------------------------------------------------------------------ *
 * 3. Internal tags — only the six the category SQL actually reads
 * ------------------------------------------------------------------ */

/** Kept aligned with 0004_categories.sql / 0008_hero_based_categories.sql. */
const PLACES =
  /\b(restaurant|caf[eé]|bistro|diner|bakery|patisserie|hotel|izakaya|ramen shop|noodle shop|sushi bar|pizzeria|steakhouse|deli|brasserie|eatery|pub|tavern|banquet hall|dining room|cocktail bar|wine bar|rooftop bar|buffet|brewery|winery|tearoom|tea house|cafeteria|canteen|food stall|food truck|food court|night market|street food|hotpot|commercial kitchen|professional kitchen|open kitchen|kitchen|market|temple|shrine|tower|bridge|harbou?r|beach|coast|mountain|forest|desert|canyon|village|waterfall|lake|river|ocean|cliff|island|countryside|landmark|castle|palace|skyline|city street|alley|plaza|square|downtown|station|airport|park|garden|gym|stadium|studio|apartment|bedroom|bathroom|office|boutique|rooftop|farmhouse|cabin|villa|orchard|vineyard|subway|train|arena|salt flat|tokyo|kyoto|osaka|paris|london|new york|rome|venice|dubai|seoul|bangkok|manhattan|tuscany|han river|gwangjang)\b(?![-–](?:green|blue|red|white|black|neck|shaped|like|colou?red|toed|style|wear))/gi;

const DRINKS =
  /\b(coffee|latte|espresso|cappuccino|mocha|matcha|tea|boba|soda|cola|juice|smoothie|milkshake|cocktail|wine|beer|sake|champagne|lemonade|cocoa|energy drink|sparkling water|pepsi|red bull|starbucks)\b/gi;

const FOODS =
  /\b(ramen|noodles?|sushi|pizza|pasta|bread|cake|dessert|pastry|croissant|burger|steak|fish|seafood|rice|soup|broth|dumplings?|tacos?|curry|salad|sandwich|chocolate|ice cream|strawberr(?:y|ies)|mango|lemon|tomato|mushrooms?|vegetables?|herbs?|spices?|beef|chicken|pork|egg|cheese|honey|fruit|barbecue|hotpot|picnic|meal|dish|cuisine)\b/gi;

const SUBJECTS: [RegExp, string][] = [
  [/\bchefs?\b|\bcooks?\b|\bcreator (?:is )?cutting\b/i, 'chef'],
  [/\bbaristas?\b/i, 'barista'],
  [/\bcouriers?\b|\bdelivery (?:rider|driver)\b/i, 'courier'],
  [/\bdrivers?\b|\bracer\b|\brider\b|\bcyclist\b/i, 'driver'],
  [/\bagents?\b|\bassassin\b|\bthief\b|\bheist\b/i, 'agent'],
  [/\bfamil(?:y|ies)\b|\bfriends\b|\broommate\b/i, 'family'],
  [/\bguests?\b|\bdiners?\b|\bcustomers?\b|\bpatrons?\b/i, 'guest'],
  // Last on purpose: an animal only carries the film when no human role does.
  // 0004 turns this tag straight into the Characters facet, and a woman
  // walking her puppy is not a character film.
  [/\b(?:cat|dog|puppy|raccoon|capybara|bulldog|penguin|panda|fox|bear|rabbit|mouse)\b/i, 'animal-character'],
];

/** The controlled action vocabulary from decompose.ts's schema. */
const ACTIONS: [RegExp, string][] = [
  [/\bsprint(?:s|ing)?\b|\brunning\b|\bruns\b/i, 'sprinting'],
  [/\bleap(?:s|ing)?\b|\bjump(?:s|ing)?\b/i, 'leaping'],
  [/\bslid(?:e|es|ing)\b/i, 'sliding'],
  [/\bgarnish(?:es|ing)?\b/i, 'garnishing'],
  [/\bserv(?:e|es|ing)\b|\bplaces? the (?:dish|drink|plate)\b/i, 'serving'],
  [/\bpour(?:s|ing)?\b/i, 'pouring'],
  [/\bplat(?:es|ing)\b|\barrang(?:es|ing) .{0,20}plate\b/i, 'plating'],
  [/\bflip(?:s|ping)?\b/i, 'flipping'],
  [/\bsear(?:s|ing)?\b|\bfry(?:ing)?\b|\bsaut[eé](?:s|ing)?\b/i, 'searing'],
  [/\bchop(?:s|ping)?\b|\bslic(?:es|ing)\b|\bcut(?:s|ting)? (?:vegetables|ingredients)\b/i, 'chopping'],
  [/\bfroth(?:s|ing)?\b|\bsteam(?:s|ing) milk\b/i, 'frothing'],
  [/\bbit(?:e|es|ing)\b|\bsip(?:s|ping)?\b|\btastes?\b/i, 'biting'],
  [/\bvault(?:s|ing)?\b|\bparkour\b/i, 'vaulting'],
  [/\bdriv(?:es|ing)\b/i, 'driving'],
  [/\brac(?:es|ing)\b|\bspeeds? (?:through|past)\b/i, 'racing'],
  [/\bfeast(?:s|ing)?\b|\bdin(?:es|ing)\b|\bshares? (?:a )?meal\b/i, 'feasting'],
];

const MOODS: [RegExp, string][] = [
  [/\bappetis(?:ing|hing)\b|\bdelicious\b|\bmouth[- ]watering\b|\bASMR\b/i, 'appetising'],
  [/\bcomed(?:y|ic)\b|\bfunny\b|\bhumou?r\b|\bcomic\b/i, 'comedic'],
  [/\bplayful\b|\bcheerful\b|\bjoyful\b|\blaugh(?:s|ing|ter)\b|\bupbeat\b/i, 'playful'],
  [/\bintense\b|\btension\b|\burgent\b|\bfierce\b|\bexplosive\b/i, 'intense'],
  [/\bepic\b|\bgrand\b|\bmonumental\b/i, 'epic'],
  [/\bawe\b|\bbreathtaking\b|\bstunning\b|\bmajestic\b/i, 'awe'],
  [/\breveren(?:t|ce)\b|\bsolemn\b|\bmeditative\b|\bquiet ritual\b/i, 'reverent'],
  [/\bcalm\b|\bpeaceful\b|\bserene\b|\btranquil\b|\bgentle\b|\bcos(?:y|zy)\b|\brelaxed\b/i, 'calm'],
];

const uniqLower = (m: RegExpMatchArray | null): string[] =>
  m ? [...new Set(m.map((s) => s.toLowerCase()))] : [];

function firstTag(text: string, table: [RegExp, string][]): string {
  for (const [re, tag] of table) if (re.test(text)) return tag;
  return 'none';
}

function allTags(text: string, table: [RegExp, string][], limit = 3): string {
  const found = table.filter(([re]) => re.test(text)).map(([, tag]) => tag);
  return found.length ? [...new Set(found)].slice(0, limit).join('; ') : 'none';
}

export type OfflineShot = {
  shot_index: number;
  verbatim_text: string;
  description: string;
  tc_in: number;
  tc_out: number;
  subject_role: string;
  action: string;
  food_item: string;
  food_role: string;
  setting: string;
  mood: string;
};

export type OfflineDecomposition = {
  runtime_s: number | null;
  aspect_ratio: string | null;
  realism_level: string;
  grade: string | null;
  motion_feel: string;
  shots: OfflineShot[];
};

/** Stated duration: "15 seconds", "15-second", "[Duration] 15 seconds". */
function runtimeOf(prompt: string, beats: Beat[]): number | null {
  const stated = /\b(\d{1,3})[\s-]?(?:second|sec\b|s\b)[\s-]?(?:video|film|short|sequence|clip|commercial|duration)?/i.exec(prompt);
  const fromBeats = beats.reduce((n, b) => Math.max(n, b.tc_out), 0);
  if (fromBeats > 0) return Math.round(fromBeats);
  const n = stated ? Number(stated[1]) : 0;
  return n >= 3 && n <= 300 ? n : null;
}

function aspectOf(prompt: string): string | null {
  if (/\b9:16\b|\bvertical (?:screen|format|video)\b|\bportrait (?:aspect|orientation)\b/i.test(prompt)) return '9:16';
  if (/\b2\.39:1\b/.test(prompt)) return '2.39:1';
  if (/\b1:1\b|\bsquare\b/i.test(prompt)) return '1:1';
  if (/\b16:9\b|\bhorizontal (?:screen|format)\b|\bwidescreen\b|\blandscape\b/i.test(prompt)) return '16:9';
  return null;
}

function realismOf(prompt: string): string {
  if (/\b(?:3d (?:animation|animated|render)|pixar|dreamworks|illumination|unreal engine|cgi animated)\b/i.test(prompt)) return '3d-animation';
  if (/\bstop[- ]motion\b|\bclaymation\b/i.test(prompt)) return 'macro-stopmotion';
  if (/\b(?:photorealistic|ultra[- ]realistic|live[- ]action|photoreal|documentary)\b/i.test(prompt)) return 'photoreal';
  return 'stylized-real';
}

function gradeOf(prompt: string): string | null {
  if (/\bteal[- ]and[- ]orange\b|\bteal.{0,12}orange\b/i.test(prompt)) return 'teal-orange';
  if (/\bgolden[- ]hour\b/i.test(prompt)) return 'golden-hour';
  if (/\bneon (?:magenta|purple|pink)\b|\bmagenta\b/i.test(prompt)) return 'neon-magenta';
  if (/\bwarm (?:amber|golden|tungsten)\b|\bamber\b/i.test(prompt)) return 'warm-amber';
  if (/\bcool[- ]blue\b|\bcold blue\b|\bblue hour\b|\bcyan\b/i.test(prompt)) return 'cold-blue';
  if (/\bmixed (?:tones?|grade|palette)\b/i.test(prompt)) return 'mixed';
  return null;
}

export function offlineDecompose(input: {
  title: string;
  summary: string | null;
  verbatim_prompt: string;
}): OfflineDecomposition {
  const prompt = input.verbatim_prompt;
  const head = `${input.title} ${input.summary ?? ''}`;

  let beats = splitBeats(prompt);
  if (beats.length < 2) beats = groupSentences(prompt);
  if (!beats.length) beats = [{ text: prompt, tc_in: -1, tc_out: -1 }];

  // food_role is a whole-clip judgement: hero when the food is what the film
  // is about (it is named in the title or summary), featured when it recurs
  // across beats, incidental on a single passing mention. 0004 reads exactly
  // this to decide the Food and Beverage facets.
  const edibleIn = (t: string) => [...uniqLower(t.match(FOODS)), ...uniqLower(t.match(DRINKS))];
  const headFood = edibleIn(head);
  const beatsWithFood = beats.filter((b) => edibleIn(b.text).length).length;
  const clipFoodRole = headFood.length
    ? 'hero'
    : beatsWithFood >= 2
      ? 'featured'
      : beatsWithFood === 1
        ? 'incidental'
        : 'none';

  // A beat whose every clause was setup or specification describes nothing on
  // screen. Drop it rather than repeating another shot's text — a duplicated
  // description is worse than one fewer shot.
  const usable = beats.slice(0, 12).filter((b) => toDescription(b.text).length >= 25);
  const kept = usable.length ? usable : [{ text: prompt, tc_in: -1, tc_out: -1 }];

  const shots: OfflineShot[] = kept.map((b, i) => {
    const text = b.text.trim();
    const scoped = `${text} ${i === 0 ? head : ''}`;
    const foods = edibleIn(text);
    return {
      shot_index: i + 1,
      verbatim_text: text,
      // The summary is the last resort: real prose written by a human,
      // already client-safe, and never a copy of a sibling shot.
      description: toDescription(text) || input.summary || input.title,
      tc_in: b.tc_in,
      tc_out: b.tc_out,
      subject_role: firstTag(scoped, SUBJECTS),
      action: allTags(text, ACTIONS),
      food_item: foods.length ? foods.slice(0, 3).join('; ') : 'none',
      food_role: foods.length ? clipFoodRole : 'none',
      // setting carries the place words the category SQL matches on, so the
      // facets derive from the same vocabulary the rest of the library uses.
      setting: uniqLower(text.match(PLACES)).slice(0, 4).join(', ') || 'none',
      mood: firstTag(text, MOODS),
    };
  });

  return {
    runtime_s: runtimeOf(prompt, beats),
    aspect_ratio: aspectOf(prompt),
    realism_level: realismOf(prompt),
    grade: gradeOf(prompt),
    motion_feel: /\bslow[- ]?mo(?:tion)?\b|\bhigh[- ]speed photography\b/i.test(prompt)
      ? 'high-fps-slowmo'
      : '24fps-cinematic',
    shots,
  };
}
