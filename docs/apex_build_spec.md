# APEX CLIP DATABASE — BUILD SPEC v1 (DRAFT)

Built from 25 live-calibrated samples. **Nothing here is locked.** One rule is unresolved (Halloween / `occasion_context`) and one verdict is contested (see Open Items).

Files:
- `apex_schema.csv` — every field, type, picklist, **and visibility**
- `apex_clips.csv` — 17 keepers, fully tagged
- `apex_shots.csv` — 103 shot rows, decomposed
- `apex_build_spec.md` — this document

---

## 1. THE CORE ARCHITECTURE

**Two tables. Clip is the parent, shot is the child.**

The gate runs at **clip level**. Cuts die whole — they are logged with a `cut_reason` and **never decomposed into shot rows**. No fragment of a cut clip ever enters the library. Only keepers get broken down.

**Search hits the clip. Shot rows are the refinement layer inside it.** Someone searches "drone" or "pasta" or "burger flip" — clips come back. They open a clip and see where the beat lives.

---

## 2. THE VISIBILITY WALL — the single most important line in this build

`shot.verbatim_text` **is the business.** It is the liftable prompt fragment. It never leaves our side.

| | Internal (us) | Client |
|---|---|---|
| Shot | `verbatim_text` — the prompt line | `description` — what actually happens |
| | every tag: action, camera, food_role, vfx, risk | `shot_index`, `shot_count` |
| Clip | verdict, gate, flags, prompt_health, product_fit | `title`, `summary`, `runtime`, `shot_count` |

**Enforce at the field level, not in the UI.** The client API returns only fields marked `client` in `apex_schema.csv`. A hidden column in a front-end is not a boundary.

Rules for `description`: no prompt vocabulary (no "whip-pan", no "ALEXA 65mm", no timestamps-as-syntax), and never granular enough to reconstruct the prompt. Describe the moment, not the instruction.

**Client journey:** picks a clip → sees it has *n* shots → reads *n* descriptions → **selects the beats they want.** That selection is captured (`client_selection`, not yet built) and feeds the intake form and the motion/emotion script.

---

## 2b. THE ASSET LINK — a library you can't watch is a spreadsheet

Three URL fields, and they are **not** the same thing:

| Field | Holds | Visibility | Why |
|---|---|---|---|
| `video_url` | the watchable clip | **client** | this is what they click |
| `thumbnail_url` | poster frame | client | the grid |
| `source_url` | where it came from (X post, original upload) | **internal** | sending a client to the source sends them to someone else's work — and sometimes straight to the prompt |
| `shot_deeplink` | `video_url#t=<tc_in>` | client | **derived, per shot row** |

`shot_deeplink` is what makes 103 shot rows usable rather than theoretical. Search returns *"drone shot of food in motion"* → click → the ramen clip opens at 5.1 seconds, on the beat.

**Current state: `asset_status = missing` on all 17.** Twenty-four of the twenty-five samples were pasted to me as raw prompt text with no link. Exactly one `source_url` exists in the corpus (`APX-C-010`, the X post I couldn't open). Every `video_url` is blank, so every deeplink is blank. **The columns are built and wired; they need populating from wherever the rendered clips actually live.**

---

## 3. THE GATE — ingest logic

```
STEP 1 — grounded + brand-safe?
  Off-world / dark / supernatural / fantasy world unrelated to food?
  → FAIL: verdict=cut, cut_reason = not-grounded | not-brand-safe. STOP. Do not decompose.

STEP 2 — does it arrive at a hospitality home?
  DIRECT       — food / venue / guest is the subject
  ASPIRATIONAL — grounded + brand-safe + premium cinematic quality (NO content floor)
  → NEITHER: verdict=cut, cut_reason = no-home. STOP.

STEP 3 — authenticity
  Is the human moment fake? (staged accident, performed cuteness, contrived skit)
  → FAIL: verdict=cut, cut_reason = fake-contrived. STOP.
  NB: honest absurd comedy (cat chef, cartoon raccoon) and genre-honest ad
  performance (food-CM enthusiasm) both PASS. The cut is falseness, not comedy.

STEP 4 — keep. Then tag:
  distinctiveness (high/standard/low)   — weak-but-valid keeps get "low", never lead a selection
  prompt_health (clean/shaky/likely-bad-render)
  risk_flags, ip_flags, fix_note

STEP 5 — decompose into shot rows.
```

### The threshold is generous
A keep only puts a clip in the **searchable library**. Nothing is committed until the **client selects it** — selection is their gate, not ours. B.O.B., the prompt layer and intake upgrades fix rough prompts and weak feel downstream.

So: **keep anything that *arrives*.** Roughness, weak prompts, not-quite-premium polish are **fix-it flags, not cuts.**

Cut only the **un-fixable**:
- can't arrive (no home, or fails grounded + brand-safe)
- fake/contrived in concept

*"Shitty but real-world" = keep, tagged low-distinctiveness.* You cannot intake-form a hellscape into a hospitality clip; you can absolutely upgrade a boring one.

---

## 4. THE RULES, AND THE SAMPLE THAT EARNED EACH

| # | Rule | Taught by |
|---|---|---|
| 1 | **Impossible ≠ cut.** Heightened action is fine. Render style is never the issue. | ramen chef |
| 2 | **Transformation ≠ cut.** | spice cosmos |
| 2b | A **person** transforming keeps if into a **human role** (matador, chef). Cuts if into a **non-human being** (demon). *The variable is what they become.* | espresso matador vs demon |
| 2c | A transform into a **fantasy world** keeps if the world is **made of the food**. Cuts if it's an unrelated off-world place. *Return-to-reality is not required.* | dessert world vs demon hellscape |
| 3 | **Don't reach for the rescue.** Assess the clip as presented; never invent its keep-able cousin. | gacha summon |
| 4 | **Render words don't carry brand.** Zero indexable hospitality content = presumptive cut. | gacha, anime fight |
| 5 | **Featured food earns the home.** Load-bearing, not a prop. Off-world setting alone doesn't cut. | donut heist |
| 6 | **Execution is a fix-it flag, not a cut** (downgraded — see Open Items). | speed-chef |
| 7 | **Animal in a human hospitality role keeps.** Inverse of person→non-human. | cat chef |
| 8 | **Dark surface + real food home = keep. Dark + no home = cut.** Darkness was never the trigger; the home is. | cyborg market vs volcanic temple |
| 9 | **Two routes to a home:** direct, or aspirational (grounded + brand-safe + premium cinematic). Aspirational is **wide** — action/thriller qualifies — and has **no content floor**. | Porsche, spy chase, main-character-energy |
| 10 | **Authenticity gate.** Fake human moments cut. Honest comedy doesn't. | mug drop vs cat chef |

**Calibration anchors** (hold these; they isolate one variable each):
- demon **vs** ramen → *impossible* ≠ cut
- demon **vs** spices → *transformation* ≠ cut
- demon **vs** espresso-matador → *entity* transform cuts, *human-role* transform keeps
- demon **vs** dessert world → fantasy *made of food* keeps, unrelated hellscape cuts
- **cyborg food-market vs volcanic temple** → holds darkness constant, varies only the home. The cleanest teacher in the set.

---

## 5. TEST FIXTURES — the cuts

These are **not seed rows.** They are the regression suite. If the ingest code disagrees with any of these, the code is wrong.

| Sample | Expected verdict | cut_reason | Fails at |
|---|---|---|---|
| Demon transformation / hellscape | cut | not-brand-safe | Step 1 |
| Gacha summon machine + fantasy UI | cut | no-home | Step 1/2 |
| Anime energy-weapon fight, ruined mall | cut | no-home | Step 1/2 |
| Volcanic temple dark-fantasy + dragon | cut | not-grounded | Step 1 |
| Pickup truck → mech rhino | cut | no-home | Step 1/2 |
| Coffee mug dropped **on purpose** + performed pout | cut | **fake-contrived** | Step 3 |
| Super-speed cooking commercial | **CONTESTED** | see Open Items | — |

And the keeps that must survive: **Porsche** (aspiration, no dish), **spy chase** (aspiration, no food at all), **main-character-energy** (aspiration, no content floor), **cyborg market** (dark, but a food home), **donut heist** (off-world, but featured food).

The wide aspirational route must not rescue a single cut. It doesn't — they all fail Step 1 first. **Step 1 is what protects Step 2.**

---

## 6. WHAT THE 17 KEEPERS LOOK LIKE

103 shot rows. Every one carries a liftable `verbatim_text` and a client-safe `description`.

Worked query — *"a drone shot of food in motion"* → `camera_movement=drone` AND `food_role=hero` → returns `APX-S-001-3`:

> *"Drone shot — they leap across narrow alley gaps between buildings. SLOW MOTION: steam spirals upward into neon light… They casually garnish the ramen mid-air with one hand — flawless precision."*

Lift it. Swap ramen for burger. Check `realism_level` on the parent (photoreal) matches the target. Splice. That's the recombination engine — and it works because the fragment carries its own tags *and* its parent's style fingerprint.

**Style fields are informational, never a block.** `realism_level` + `grade` + `render_stack` surface a mismatch (you cannot cut photoreal ALEXA against a 3D cartoon). The builder is warned. The human decides.

---

## 7. OPEN ITEMS — do not build past these without a ruling

**① Halloween / `occasion_context` — NO RULE EXISTS.**
The field is in the schema with an empty rule behind it. `APX-C-010` (cyborg → food market → zombies, blood, severed limbs) is currently a **keep**, justified by its food-market home and strong execution — *not* by any Halloween licence. If dark-for-the-occasion turns out to be its own route to a home, that clip's basis changes and several cuts may need revisiting. **Feed the Halloween samples before this ships.**

**② The super-speed cooking commercial — contested verdict.**
You cut it on your eyes ("it's fucking shit… disjointed"). We later downgraded execution from a cut to a fix-it flag. Under the current rules it would be a **keep** (grounded, brand-safe, maximal food home) with `prompt_health = likely-bad-render` and a fix note. **Both can't be true.** Either execution can still cut a clip outright, or that one flips to keep. Your call. I've left it out of the 17 pending your ruling.

**③ Product names — I was inventing them.**
Throughout our calibration I referred to *Apex Cinema*, *Apex Icon*, *Apex Calendar* and *Apex Origin*. **None of those exist.** The nine in your docs are **Stay, Menu, Event, Promotion, Live, Venue, Studio, Experience, International.** I have re-mapped every `product_fit` in `apex_clips.csv` to the real nine. Check my mapping — it's my inference, not your ruling.

**④ Every `video_url` is empty. `asset_status = missing` × 17.**
The fields exist and `shot_deeplink` derives from them automatically — but nothing is linked. I was given prompts, not clips. One `source_url` exists in the whole corpus. Until the rendered clips are pointed at, nobody can watch anything and the deeplinks are dead. This is the fastest thing on the list to fix and it blocks the entire client-facing surface.

**⑤ Not yet built:** `client_selection` (which shots a client picked, feeding intake), template-family grouping (`APX-C-012` / `APX-C-013` are siblings), and the semantic-search layer over `description`.

**⑥ `apex_seedance_database_v3BOB.csv`** — I have never seen it. If it's live, the migration path needs writing.

---

## 8. HANDOFF NOTE FOR CLAUDE CODE

Build the two tables per `apex_schema.csv`, honouring the `visibility` column at the API layer. Seed with `apex_clips.csv` + `apex_shots.csv`. Implement Steps 1–5 as the ingest function. Then run the fixtures in §5 — **if the code disagrees with Aidan's eye on any of the 25, the code is wrong, not the eye.**

Do not resolve Open Item ① or ② in code. They are Aidan's to call.
