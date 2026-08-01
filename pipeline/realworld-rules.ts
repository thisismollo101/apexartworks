/**
 * THE REAL-WORLD RULE — the offline editorial gate for imported prompts.
 *
 * RULING (Aidan, 2026-08-01): "i dont want sci-fi and fantasy and anime and 2D.
 * We want to get rid of those ones." Earlier, on the same question: "We only
 * run real world... We can take Pixar style, but we don't want anything super
 * fantasy."
 *
 * Two tests, and a clip must pass BOTH:
 *   1. THE WORLD is physically real. Off-world, supernatural, magical, mythic
 *      and sci-fi settings are out — including the ones the LLM gate keeps.
 *   2. THE MEDIUM is live action or 3D CG. Anime and flat 2D are out EVEN WHEN
 *      the setting is real (an anime-rendered cooking montage is a cut). This
 *      is new: the LLM gate says "render style is never the issue".
 * Pixar-style 3D CG is explicitly SAFE — it is the medium Aidan asked to keep.
 *
 * SCOPE: imports only. The 766 clips already live are NOT re-judged, nothing
 * existing is removed, and pipeline/gate-rules.ts is deliberately untouched —
 * its header forbids changing the LLM rules without a ruling, and its answer
 * key (pipeline/regression.ts) costs API budget to run. Editing rules we have
 * no budget to re-verify would leave the rules, the fixtures and the last
 * verified behaviour all disagreeing. This file supersedes gate-rules.ts lines
 * 26/27/29/30 for imports after this date, and only for imports.
 *
 * WHY THIS IS NOT A KEYWORD GREP. Three things:
 *   - Negative prompts are stripped first. Over half these prompts end with
 *     "Negative Prompt: cartoon, anime, CGI, deformed…" — scoring that text
 *     cuts precisely the photoreal clips that took care to say so.
 *   - Every decision carries its evidence, so the review file explains itself.
 *   - Anything short of decisive lands in REVIEW, which is not loaded. A tuned
 *     threshold is a guess; a human reading 100 rows is free and is not.
 *
 * Do not soften these lists without a ruling from Aidan.
 */

export type Evidence = {
  rule: 'floor' | 'medium' | 'world' | 'rescue';
  term: string;
  where: 'title' | 'body';
  weight: number;
};

export type RealWorldVerdict = {
  verdict: 'keep' | 'cut' | 'review';
  /** Populated on a cut; mirrors the cut_reason vocabulary of the LLM gate. */
  cut_reason:
    | 'floor-child-safety'
    | 'not-live-action'
    | 'not-grounded'
    | 'not-brand-safe'
    | 'none';
  score: number;
  evidence: Evidence[];
  /** One line, for the review file. */
  note: string;
};

/* ------------------------------------------------------------------ *
 * Text preparation
 * ------------------------------------------------------------------ */

/**
 * Everything after a negative-prompt marker is what the author does NOT want.
 * Scoring it inverts the rule: "no cartoon, no anime, photorealistic" would
 * read as an anime clip. Measured on the supplied collection, more than half
 * the entries carry such a block.
 */
const NEGATIVE_BLOCK =
  /(\[?\s*negative\s*prompts?\s*\]?\s*[:\-]?|\[NEGATIVE\]|negative\s*:)[\s\S]*?(?=\n\s*\n\s*\[|\n\s*\n\s*####|$)/gi;

/** Inline denials — "no cartoon", "not photorealistic", "without CGI". */
const DENIAL = /\b(no|not|never|without|avoid|avoiding|free of|anti)\s+$/i;

export function stripNegatives(text: string): string {
  return text.replace(NEGATIVE_BLOCK, ' ');
}

/** True when the match at `index` is denied by the words immediately before it. */
function isDenied(haystack: string, index: number): boolean {
  return DENIAL.test(haystack.slice(Math.max(0, index - 14), index));
}

/* ------------------------------------------------------------------ *
 * Lexicons
 * ------------------------------------------------------------------ */

/** A 3D/CG declaration vetoes a medium cut: this is the style Aidan keeps. */
const CG_SAFE =
  /\b(3d (animation|animated|render|cg|pixar)|pixar|dreamworks|illumination|unreal engine|octane|blender|cgi|photorealistic 3d|stylized 3d|claymation|clay animation|stop[- ]motion)\b/i;

/**
 * Medium cuts — the render itself is 2D or anime. Decisive on their own,
 * unless a CG_SAFE declaration is present (see gate()).
 */
const MEDIUM_CUT: [RegExp, string][] = [
  [/\banime\b/i, 'anime'],
  [/\bmanga\b/i, 'manga'],
  [/\bcel[- ]?shad(ing|ed)\b/i, 'cel-shading'],
  [/\bghibli\b/i, 'ghibli'],
  [/\bchibi\b/i, 'chibi'],
  [/\bsakuga\b/i, 'sakuga'],
  [/\btoon\b/i, 'toon'],
  [/\bwebtoon\b/i, 'webtoon'],
  [/\bshonen\b/i, 'shonen'],
  [/\bvtuber\b/i, 'vtuber'],
  [/\bpixel art\b/i, 'pixel art'],
  // Bare "2D" is safe to cut on: across this collection it only ever means
  // flat animation ("2D sticker", "2D black and white graffiti").
  [/\b2\.?5?\s?d\b/i, '2D'],
  [/\bflat 2\.?5?d\b/i, 'flat 2D'],
  [/\b(2\.?5?d )?sticker (character|girl|art|style)\b/i, 'sticker character'],
  [/\bhand[- ]drawn\b/i, 'hand-drawn'],
  [/\bline art\b/i, 'line art'],
  [/\bcomic (panel|book style)\b/i, 'comic panel'],
  [/\bstorybook illustration\b/i, 'storybook illustration'],
  [/\bink[- ]wash animation\b/i, 'ink-wash animation'],
  [/\bj-?pop idol (anime|animation)\b/i, 'anime idol'],
];

/**
 * World cuts — the setting is not the real world. Decisive in a title; in the
 * body, two independent hits are decisive and one lands in review.
 */
const WORLD_CUT: [RegExp, string][] = [
  [/\bdragons?\b/i, 'dragon'],
  [/\bkaiju\b/i, 'kaiju'],
  [/\bmecha\b|\bmech\b|\bpowered armor\b/i, 'mecha'],
  [/\btitan (dragon|beast)\b|\bstone titan\b/i, 'titan'],
  [/\bdemons?\b/i, 'demon'],
  [/\bhellscape\b|\binferno of hell\b|\bunderworld\b/i, 'hellscape'],
  [/\bundead\b|\bzombies?\b|\bvampires?\b|\bwerewol(f|ves)\b/i, 'undead'],
  [/\borcs?\b|\bgoblins?\b|\bgnomes?\b|\belves\b/i, 'fantasy race'],
  [/\bwizards?\b|\bsorcer(er|ess|y)\b|\bwitch(es)?\b|\bwarlock\b/i, 'wizard'],
  [/\baliens?\b|\bextraterrestrial\b/i, 'alien'],
  [/\bspace ?ship\b|\bstarship\b|\bspacecraft\b|\bspace station\b/i, 'spaceship'],
  [/\bastronaut\b|\bspacesuit\b/i, 'astronaut'],
  [/\bfrozen (alien )?moon\b|\balien planet\b|\boff[- ]world\b/i, 'off-world'],
  [/\bxianxia\b|\bwuxia\b|\bsword immortal\b|\bcultivat(or|ion)\b/i, 'xianxia'],
  [/\bcelestial (warrior|being|starlight)\b|\bzodiac (champion|battle)\b/i, 'celestial'],
  [/\bmythical beast\b|\bancient beast\b|\bmonsters?\b|\bcreature feature\b/i, 'monster'],
  [/\bsuper ?powers?\b|\bsuperhuman\b|\btelekinesis\b|\bteleport\b/i, 'superpower'],
  [/\b(freeze|freezes|freezing|stops?) time\b|\btime (freeze|instantly stops|stands still)\b/i, 'time-freeze'],
  [/\bmagic(al)? (spell|portal|energy|force|hands?)\b|\bspell ?cast(ing)?\b|\bincantation\b/i, 'magic'],
  [/\b(glowing|luminous|ancient) portal\b|\bportal\b/i, 'portal'],
  [/\benchanted\b|\belixir\b|\bpotion\b|\bprophecy\b|\bcursed\b/i, 'enchantment'],
  [/\bcyberpunk\b|\bcyborg\b|\bandroid\b|\bbionic\b/i, 'cyberpunk'],
  [/\bdystopian?\b|\bpost[- ]apocalyp(se|tic)\b|\bwasteland\b/i, 'dystopia'],
  [/\bsci-?fi\b|\bscience fiction\b/i, 'sci-fi'],
  [/\brail cannon\b|\bplasma\b|\benergy (beam|blade|weapon|ribbons?)\b|\blaser (rifle|sword)\b/i, 'energy weapon'],
  [/\bgacha\b|\bboss fight\b|\bHUD overlay\b|\bcharacter[- ]select\b/i, 'game world'],
  [/\bbreathing technique\b|\bwater dragon\b|\bthunder breathing\b/i, 'anime power'],
  [/\bgiant burning hands\b|\bink[- ]wash swallows\b/i, 'impossible VFX'],
  // Combat-fantasy staging. These read as real-world nouns one at a time, but
  // as the subject of a film they are the genre Aidan is cutting.
  [/\bwarriors?\b|\bknights?\b|\bsamurai\b|\bgladiator\b|\bswordsman\b/i, 'warrior'],
  [/\bbattlefield\b|\bbattle sequence\b|\bwar sequence\b|\bcombat arena\b|\bfight(ing)? arena\b/i, 'battlefield'],
  [/\bcosmic\b|\bgalax(y|ies)\b|\bnebulae?\b|\bsupernovae?\b|\bconstellation (light|lines)\b/i, 'cosmos'],
  [/\bmagically\b|\bweightless\b|\bfloating islands?\b|\bflooded ballroom\b/i, 'impossible physics'],
  [/\bhorror\b|\bhaunted\b|\bpossessed\b|\beerie (smoke|figure)\b/i, 'horror'],
];

/** Brand safety — a separate reason from "not real". */
const BRAND_CUT: [RegExp, string][] = [
  [/\bgore\b|\bblood(y| splatter)?\b|\bdecapitat/i, 'gore'],
  [/\bexecution\b|\bkill(ing)? (blow|shot)\b|\bmassacre\b/i, 'violence'],
  [/\bbattleship\b|\bwarship\b|\bfighter jet\b|\bair (raid|assault)\b|\bcarrier[- ]based\b/i, 'warfare'],
  [/\bhydraulic press\b.*\b(flatten|crush)/i, 'crush harm'],
  [/\b(battling|fight(s|ing)?|attacks?) (a )?(group of )?(wild )?(lions?|tigers?|bears?|wolves)\b/i, 'animal harm'],
  [/\bshatter(ing|s)? (its|his|her|the) teeth\b/i, 'animal harm'],
];

/** Real-world anchors. These pull a borderline clip back toward keep. */
const RESCUE: [RegExp, number, string][] = [
  [/\b(commercial|advertisement|\bad\b|campaign|brand)\b/i, 3, 'commercial'],
  [/\bUGC\b/i, 3, 'UGC'],
  [/\bvlog\b|\bday in (my|the) life\b|\bGRWM\b|\bget ready with me\b/i, 3, 'vlog'],
  [/\bdocumentary\b|\bcin[eé]ma v[eé]rit[eé]\b|\bnews footage\b/i, 3, 'documentary'],
  [/\brestaurant\b|\bcaf[eé]\b|\bbistro\b|\bdiner\b|\bbakery\b|\bizakaya\b|\bfood (stall|truck|market|court)\b|\bnight market\b/i, 3, 'venue'],
  [/\bhotel\b|\bvilla\b|\bguesthouse\b|\bfarmhouse\b|\bcabin\b/i, 2, 'stay'],
  [/\bkitchen\b|\bcooking\b|\brecipe\b|\bchef\b|\bbarista\b/i, 2, 'kitchen'],
  [/\bcoffee\b|\bjuice\b|\bsmoothie\b|\bsoft drink\b|\bbeverage\b|\bcocktail\b/i, 2, 'beverage'],
  [/\brunway\b|\bcatwalk\b|\bcouture\b|\bboutique\b|\bOOTD\b|\bskincare\b|\bshampoo\b/i, 2, 'fashion'],
  [/\bgym\b|\bworkout\b|\bolympic\b|\bstadium\b|\bgymnastics\b|\bdiving\b/i, 2, 'sport'],
  [/\b(mountain )?bik(e|ing)\b|\bbicycle\b|\bcycling\b|\bskateboard\w*\b|\bsurf(ing|er)\b|\bskiing\b|\brider\b/i, 2, 'sport'],
  [/\bdanc(e|er|ing)\b|\bchoreograph\w*\b|\bk-?pop\b|\bj-?pop\b|\bmusic video\b|\bMV\b|\brap(per|ping)\b|\bhip hop\b/i, 2, 'music'],
  [/\bbar\b|\bpub\b|\btavern\b|\blounge\b|\bbrewery\b/i, 2, 'venue'],
  [/\boutfit\b|\bwardrobe\b|\bdress\b|\bsneakers?\b|\bstyling\b/i, 1, 'fashion'],
  [/\bcity street\b|\bdowntown\b|\bpark\b|\bbeach\b|\bforest trail\b|\bneighbou?rhood\b|\bsuburb\b/i, 1, 'real place'],
  [/\bphotorealistic\b|\bultra[- ]realistic\b|\blive[- ]action\b|\bphotoreal\b/i, 1, 'photoreal'],
  [/\biPhone\b|\bsmartphone\b|\bcamcorder\b|\bVHS\b|\bHi8\b|\bhandheld\b/i, 1, 'handheld'],
  [/\bproduct shot\b|\bhero (product |)shot\b|\bpackshot\b/i, 2, 'product'],
];

/* ------------------------------------------------------------------ *
 * The child-safety floor
 * ------------------------------------------------------------------ */

const MINOR = /\b(schoolgirl|schoolboy|high school|schoolchild|classroom|student|teen(age|ager)?s?|toddler|child(ren)?|kid|little (girl|boy)|\d{1,2}[- ]year[- ]old (girl|boy|child))\b/i;
const RISK = /\b(romance|romantic|seduc\w*|intimate|ambiguous|kiss(ing)?|bedroom|shower|bikini|lingerie|sensual|heart[- ]fluttering|crush|blood|gun|weapon|kill)\b/i;

/**
 * Deliberately over-broad. A false floor cut costs one clip; a miss costs
 * something we will not risk. Floor hits are logged by video_id only, matching
 * the discipline of pipeline/ingest.ts and the floor_log table.
 */
function floorFails(text: string): string | null {
  const minor = MINOR.exec(text);
  if (!minor) return null;
  const risk = RISK.exec(text);
  if (!risk) return null;
  // An explicit adult statement clears it.
  if (/\b(adult|over 18|18\+|\d{2}[- ]year[- ]old (woman|man)|in (her|his) (20s|30s|40s|twenties|thirties))\b/i.test(text)) {
    return null;
  }
  return `${minor[0].toLowerCase()} + ${risk[0].toLowerCase()}`;
}

/* ------------------------------------------------------------------ *
 * The gate
 * ------------------------------------------------------------------ */

function hits(
  list: [RegExp, string][],
  title: string,
  body: string,
  rule: Evidence['rule'],
  weight: number,
): Evidence[] {
  const out: Evidence[] = [];
  for (const [re, term] of list) {
    const t = re.exec(title);
    if (t && !isDenied(title, t.index)) {
      out.push({ rule, term, where: 'title', weight: weight * 2 });
      continue; // a title hit already says it; do not double-count the body
    }
    const b = re.exec(body);
    if (b && !isDenied(body, b.index)) out.push({ rule, term, where: 'body', weight });
  }
  return out;
}

export function gate(input: {
  title: string;
  summary: string | null;
  verbatim_prompt: string;
}): RealWorldVerdict {
  const title = `${input.title} ${input.summary ?? ''}`;
  const body = stripNegatives(input.verbatim_prompt);
  const all = `${title}\n${body}`;

  // 1. Floor first, always.
  const floor = floorFails(all);
  if (floor) {
    return {
      verdict: 'cut',
      cut_reason: 'floor-child-safety',
      score: 100,
      evidence: [{ rule: 'floor', term: floor, where: 'body', weight: 100 }],
      note: 'child-safety floor',
    };
  }

  // 2. Medium. Decisive unless the prompt declares 3D CG, which is the style
  //    Aidan keeps — "Pixar Style Coffee Shop Kindness" must not cut here.
  const medium = hits(MEDIUM_CUT, title, body, 'medium', 10);
  const cgSafe = CG_SAFE.test(all);
  if (medium.length && !cgSafe) {
    return {
      verdict: 'cut',
      cut_reason: 'not-live-action',
      score: medium.reduce((n, e) => n + e.weight, 0),
      evidence: medium,
      note: `2D / anime medium: ${medium.map((e) => e.term).join(', ')}`,
    };
  }

  const brand = hits(BRAND_CUT, title, body, 'world', 6);
  const world = hits(WORLD_CUT, title, body, 'world', 6);
  const rescue = RESCUE.flatMap(([re, w, term]): Evidence[] => {
    const t = re.exec(title);
    if (t && !isDenied(title, t.index)) return [{ rule: 'rescue', term, where: 'title', weight: -w * 2 }];
    const b = re.exec(body);
    return b && !isDenied(body, b.index) ? [{ rule: 'rescue', term, where: 'body', weight: -w }] : [];
  });

  const evidence = [...medium, ...brand, ...world, ...rescue];
  const worldScore = [...brand, ...world].reduce((n, e) => n + e.weight, 0);
  const rescueScore = rescue.reduce((n, e) => n + e.weight, 0);
  const score = worldScore + rescueScore;

  // A world cut named in the TITLE is what the film is about — decisive.
  const titleWorld = [...brand, ...world].filter((e) => e.where === 'title');
  if (titleWorld.length) {
    const isBrand = titleWorld.some((e) => brand.includes(e));
    return {
      verdict: 'cut',
      cut_reason: isBrand ? 'not-brand-safe' : 'not-grounded',
      score,
      evidence,
      note: `title says ${titleWorld.map((e) => e.term).join(', ')}`,
    };
  }

  // Two or more independent world signals in the body, not outweighed by real
  // -world anchors, is a cut. One signal alone is a review, never a keep.
  if (worldScore >= 12 && score > 0) {
    return {
      verdict: 'cut',
      cut_reason: brand.length ? 'not-brand-safe' : 'not-grounded',
      score,
      evidence,
      note: `${[...brand, ...world].map((e) => e.term).join(', ')}`,
    };
  }
  if (worldScore > 0 || (medium.length && cgSafe)) {
    return {
      verdict: 'review',
      cut_reason: 'none',
      score,
      evidence,
      note: medium.length
        ? `2D/anime wording but declares 3D CG — check the render`
        : `single world signal: ${[...brand, ...world].map((e) => e.term).join(', ')}`,
    };
  }

  // "Animated" / "cartoon" on their own say nothing about 2D vs 3D — the very
  // class a keyword list gets wrong. Without a 3D declaration or a photoreal
  // anchor, the render is unknown, so a human looks.
  if (/\banimat(ed|ion)\b|\bcartoon\b/i.test(all) && !cgSafe && !/\b(photorealistic|live[- ]action|ultra[- ]realistic)\b/i.test(all)) {
    return {
      verdict: 'review',
      cut_reason: 'none',
      score,
      evidence,
      note: 'animated, but neither 2D nor 3D is declared — check the render',
    };
  }

  // An unnatural hair colour with nothing photoreal said anywhere is the one
  // reliable textual tell for an anime render that never names itself — it is
  // what "Pink Haired J-Pop Idol Dance" has instead of the word "anime". Not
  // decisive on its own: people dye their hair.
  if (
    /\b(pink|blue|green|purple|teal|lilac)[- ]haired?\b|\bhair (is |dyed )?(bright )?(pink|blue|green|purple|teal)\b/i.test(all) &&
    !/\b(photorealistic|live[- ]action|ultra[- ]realistic|photoreal)\b/i.test(all)
  ) {
    return {
      verdict: 'review',
      cut_reason: 'none',
      score,
      evidence,
      note: 'unnatural hair colour and nothing photoreal stated — likely anime, check the render',
    };
  }

  // No cut signal AND no real-world signal means we have learned nothing about
  // this clip. Silence is not evidence of a keep, so it goes to the pile.
  if (!rescue.length) {
    return {
      verdict: 'review',
      cut_reason: 'none',
      score,
      evidence,
      note: 'no signal either way — too little in the prompt to judge',
    };
  }

  return {
    verdict: 'keep',
    cut_reason: 'none',
    score,
    evidence,
    note: `real-world: ${rescue.map((e) => e.term).slice(0, 4).join(', ')}`,
  };
}
