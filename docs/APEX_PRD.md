# APEX ARTWORKS — PRODUCT REQUIREMENTS DOCUMENT (v1)
### The searchable hospitality clip library — "Ads of the World for AI hospitality video"

This PRD is the authoritative brief. Where it conflicts with a coding instinct, this wins.
Two things it encodes that cannot be inferred and must not drift: **the gate** (what belongs
in the library) and **the visibility wall** (what a client may ever see). Everything else is
ordinary web work.

---

## 0. WHAT THIS IS

A public, searchable library at **apexartworks.com** modelled on adsoftheworld.com: a filterable
grid of clip cards → click a clip → watch it embedded → read its shots → select the beats you
want. Internally it's also a **recombination engine**: staff search shots by tag ("drone shot of
hero food") and lift the verbatim prompt segment to build new clips.

The library is built by running a raw prompt library through a **gate** that keeps only clips
with a hospitality home, then decomposing each keeper into shots.

---

## 1. THE DATA

**Input:** `data/apex_source_library.csv` — 3,551 rows, 5 columns:
`video_id, source_url, verbatim_prompt, prefilter_flag, has_timecode`

Derived from a 20-column working sheet. **Only three source fields are used**
(`video_id`, `source_url`, `verbatim_prompt`). Every other column in the original sheet —
their Title, their tags, their `Overall Score`, `BLB Flag` — is **discarded**. Their score is
not just unused, it is **inversely correlated with our gate** (their highest-scored sample was a
hard cut) — never sort, rank, or filter by it.

**Real-data facts (measured, not estimated):**
- 3,551 total rows
- **137 junk** rows already flagged in `prefilter_flag` (134 prompts < 100 chars, 3 no valid URL) — these are **set aside, never gated, never shown**
- 3,414 gateable rows
- Only **29% carry explicit timecodes**; **70% are prose-only** — this drives the shot-decomposition method (§4)
- URLs are ~99.9% `x.com` — piggyback links, embedded on our page, `source_url` stays internal

**Expected outcome (from a 30-row hand-gated sample): ~19% keep rate → roughly 650–700 keepers.**
The library is fantasy/creature/anime-combat heavy; the gate cuts the majority, correctly. A
smaller clean library is the goal, not a failure. Plan the launch grid around ~650 clips.

---

## 2. THE GATE  (the core IP — implement exactly)

Run per gateable row, on the **raw prompt**, via an LLM classifier (Claude API). The classifier
is given these rules and returns structured JSON:
`{ floor_pass, step1, step2_home_route, step3, verdict, cut_reason, distinctiveness, register, ip_flag, confidence }`.

Evaluate in this order. First failure stops and cuts.

### FLOOR (runs FIRST, before everything) — child safety
**Hard cut, non-negotiable.** Cut any prompt depicting a minor (anyone stated or clearly implied
to be under 18, incl. "student/schoolgirl/high-school" framing) in a **sexualised, romantic,
unsafe, violent, or exploitative** context.
- The trigger is the **harmful/sexualised/exploitative context**, NOT a minor merely being present.
  A child eating at a family table, in a festival, walking to school = fine, proceed to Step 1.
- An **age callout + sexualised/intimate framing** (e.g. "18-year-old POV… approaches her from
  behind," suggestive audio) = **immediate hard cut.**
- On anything child-adjacent, **low confidence cuts, it does not flag.** Err to cut.
- Floor cuts are logged by `video_id` only. **Never surface, fetch, or route to their source URL.**

### STEP 1 — grounded + brand-safe?
Off-world / fantasy / supernatural / dark-horror / creature-combat with no tie to the real
hospitality world → **CUT** (`not-grounded` or `not-brand-safe`).
- This is where the **majority** of the real library falls (dragons, mechs, mages, kaiju,
  cyber-combat, dystopia, war). Cut them.
- Darkness alone is NOT the trigger — dark content with a real food/venue home can keep (see
  fixtures). "Dark + no home" cuts; "dark + real food home" keeps.

### STEP 2 — hospitality home? (direct OR aspirational)
- **Direct:** food / venue / guest is the subject.
- **Aspirational:** grounded + brand-safe + premium cinematic quality. **No content floor** —
  luxury lifestyle, cars, fashion, slick action/thriller energy, even "ordinary life shot
  cinematically" all qualify. Slick + grounded + brand-safe = home.
- Neither → **CUT** (`no-home`).

### STEP 3 — authenticity
Fake/contrived human moment (staged accident, performed cuteness for the camera) → **CUT**
(`fake-contrived`). Honest absurd comedy (cat chef, cartoon animals) and genre-honest ad
performance (food-CM enthusiasm) **pass** — knowing-absurd ≠ fake-real.

### KEEP → tag
`distinctiveness` (high/standard/low — low = valid but weak, kept, never leads a selection),
`register` (flagship-ad/food-cm/craft-piece/cultural-moment/destination-showcase/light-social/
meme-comedy/mood-piece), `ip_flag` (set if named character / real artist / branded franchise —
a **flag for review, NOT an auto-cut**; a grounded aspirational clip with a K-pop group keeps
*with* the flag).

### Threshold philosophy
Keep anything that **arrives** (grounded + brand-safe + a home). Rough prompts, weak feel,
not-quite-premium polish are **fix-it flags, not cuts** — downstream (BOB, intake) upgrades them.
Cut only the **un-fixable**: can't-arrive (no home / not grounded / not brand-safe) or
fake-contrived, or the child-safety floor. "Shitty but real-world and on-brand" = keep, tagged
low-distinctiveness.

### Confidence + review
Every verdict carries a confidence. **Low-confidence verdicts are flagged for Aidan's review, not
silently decided.** The review pile is expected and is where new edge cases (e.g. Halloween)
get surfaced.

---

## 3. REGRESSION SUITE (gate must pass before touching the 3,414)

The classifier must reproduce these known verdicts (from 25 calibrated samples + real-data
sample) **before** it runs on the library. If it disagrees with Aidan's eye on any, the
classifier is wrong — fix it, not the ruling.

**Must CUT:** demon hellscape · gacha summon · anime energy fight · volcanic dark-fantasy +
dragon · truck→mech rhino · classroom romance (FLOOR) · age-callout sexualised POV (FLOOR) ·
kaiju city destruction · lightning-teleport combat · jungle-horror · astronaut-vs-alien.
**Must KEEP:** ramen sprint · dumpling courier · dessert world · espresso matador · donut heist ·
Porsche lifestyle · spy rooftop chase · main-character-energy · cyborg **food-market** · Eid ·
Wuhan/Guangzhou · beach BBQ · latte art · cat-chef · chef-vs-raccoon · rural kitchen ·
80-yr-old rapper · street racing · downhill skateboard · puppy-rescue · piano cat-and-mouse.

The 17 seed rows in `data/apex_clips.csv` / `apex_shots.csv` are **fixtures + demo seed**, and
their pre-filled verdict columns are the answer key — the live gate must derive the same verdict
from the raw prompt, not read the column.

**Open items — NOT resolved in code, Aidan's call:** Halloween/occasion rule; the contested
super-speed cooking commercial (excluded from fixtures).

---

## 4. THE PIPELINE  (ingest)

Per gateable row:
1. **Floor → Step 1 → Step 2 → Step 3** (§2). Cut → write clip row `verdict=cut` + `cut_reason`,
   **STOP. Cuts are never decomposed into shots.**
2. **Keep →** generate `title` + client-safe `summary`, insert clip row.
3. **Decompose into shots.** For each beat produce **two** fields:
   - `verbatim_text` — the exact prompt segment (**INTERNAL / IP**)
   - `description` — plain-English account of the beat (**client-facing**; no prompt vocabulary,
     never granular enough to reconstruct the prompt)
   - **Method:** if `has_timecode` → split on the timecodes (29% of rows). Else → the LLM
     **segments the prose into discrete beats** (70% of rows). Both paths in the same LLM pass.
   - Also tag each shot: `action`, `camera_movement`, `food_item`, `food_role`, `setting`, `mood`
     etc. (internal — the recombination search axes).
4. `shot_deeplink = video_url + '#t=' + tc_in`, computed server-side; null while `video_url` empty.

Junk rows (`prefilter_flag != ''`) skip the gate entirely → a review/junk log, never shown.

---

## 5. THE VISIBILITY WALL  (defense in depth — the one thing that must not leak)

`shot.verbatim_text` is the business. A client must never retrieve it, the internal tags, the
gate fields, or `source_url`, by any route.

1. **RLS deny-all** on `clip`, `shot`, `client_selection` — no anon/authenticated policies. All
   reads go through Next.js server routes using the **service-role key** (server-only env var,
   never `NEXT_PUBLIC_*`).
2. **Column allowlist** in the API layer, single source of truth from the schema `visibility`
   column:
   - Clip→client: `title, summary, runtime_s, aspect_ratio, video_url, thumbnail_url, shot_count`
   - Shot→client: `shot_index, description, shot_deeplink`
   - Everything else never appears in any response.
3. `clip_id` (APX-C-###) is an opaque catalog number, safe as a route param. `shot_id` stays
   internal; selection keys on `(clip_id, shot_index)`.
4. **Client watches the video EMBEDDED** on our page. The `x.com` link is `source_url`, internal,
   never client-facing.

**Wall audit (must pass, pre- and post-deploy):** with the anon key, a direct read of `shot`
returns zero rows; `curl` of every client endpoint, grepped for `verbatim_text`, `source_url`,
`verdict`, tag fields → all absent.

---

## 6. THE SITE  (Ads-of-the-World UX)

- **`/`** — cinematic dark grid of keeper cards (thumbnail, title, summary, runtime, shot count).
  Search box: broad→specific. "food" returns everything with a food home; "pasta" narrows.
  Search matches client-safe `shot.description` + `clip.title`/`summary` (search hits the clip).
  **Only `verdict=keep` clips ever appear.** Rank by `distinctiveness` (high leads; low never leads).
- **`/clip/[clipId]`** — embedded video, title, summary, "*n* shots" → numbered list of shot
  `description`s, each with a **select** control (+ select-whole-clip). Save → POST to
  `/api/selections` `{clip_id, shot_indexes, name?, email?}` → `client_selection` table. This is
  the flywheel trigger.
- Two-layer search so tagging gaps don't create holes: structured tag match **plus** full-text
  over `description`. A clip surfaces on "pasta" whether tagged `food_item=pasta` or just
  described as twirling pasta.

---

## 7. STACK & DEPLOY
Next.js 15 (App Router, TS, Tailwind) · Supabase (Postgres, server-side only) · Vercel ·
apexartworks.com (DNS already at Vercel). Private GitHub repo. Credentials Aidan provides at the
pauses: Supabase URL + service-role key (migration/ingest), `ANTHROPIC_API_KEY` (the gate),
`VERCEL_TOKEN` (deploy).

## 8. OUT OF SCOPE (v1)
Halloween/occasion rule (Aidan) · super-speed verdict (Aidan) · video asset population (URLs are
X posts, embedded — no re-hosting) · template-family grouping · semantic-search upgrade ·
live Google-Sheets sync (CSV export is the v1 input).

## 9. THE ONE-LINE TRUTH
Their link + their prompt in → **our gate** → our tagged, decomposed, searchable, walled library
out. ~650 clean keepers, every one of which belongs. The gate is the product.
