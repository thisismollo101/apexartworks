# APEX DESIGN SYSTEM — 03 · PRODUCT PAGE TEMPLATES

The client-facing deliverable pages — the surfaces an Apex hospitality client actually receives.
Formalised directly from the four live screens. All inherit Doc 01. These share one master template
with per-product content; document that template once, then the four variants.

---

## THE MASTER PRODUCT TEMPLATE

Every product page (Stay, Menu, Event, Promotion, Live Update, …) is the same skeleton:

```
1. SUNBURST HERO            eyebrow · title · subtitle
2. DISPLAY HEADLINE         the poster-scale emotional line + a 2-line subtitle
3. THREE-PART STRUCTURE     the product's build, as feature rows OR numbered format blocks
4. THE SET                  section label + section title + the numbered list (the actual items)
5. PILL BUTTON              one white pill, the product name
6. FOOTER                   dot-separated tag breadcrumb
```

The only things that change between products are the copy, the icons, and the list contents. The
structure is fixed — that consistency *is* the brand.

---

## VARIANT A — APEX STAY  (`Stay · The Rooms`)

- **Hero:** `APEX STAY · ROOMS` / **Stay** / `The Rooms · Hotel Labaris`
- **Display headline:** "A Room That Sells Itself!" + "The on-ramp hotel product. Every room becomes
  a film — announced, opened by a hero suite reveal, and displayed as a set guests can browse and book."
- **Three-part structure** (feature rows, icon + title + description):
  - `▭ Promotion Announcement` — "Early Bird Saving. 12% off all room types, booked 10 days ahead.
    The 48-hour attention-grab that opens every product."
  - `▷ Hero — The Pool Villa` — "The cinematic 30-second film. 300 sqm, the private infinity pool,
    the reveal. The suite that opens the room list."
  - `▤ Premium Carousel — 5 part` — "The five room types as a scrollable set. Each its own clip,
    each a room a guest can pick and book."
- **The Set:** label `THE ROOMS`, title "Five Accommodation Types", right-meta "all with private
  outdoor space". Numbered list:
  `01 Pool Villa · 300 sqm · private infinity pool` … through `05 Signature Landscapes · Green Maze
  · Infinite Forest · Endless Pool · Flower Valley`.
- **Pill:** `Apex Stay`
- **Footer:** `Apex Stay · Rooms · Announcement + Hero + 5-part Carousel · Hotel Labaris`

---

## VARIANT B — APEX MENU  (`Drinks Menu`)

- **Hero:** `APEX MENU · DRINKS` / **Drinks Menu** / `Rabbit Café · Hotel Labaris`
- **Display headline:** "A Menu That Sells Itself!" + "Give guests more than a list. Every dish
  becomes a film — announced, opened by a hero cut, and displayed as a scrollable set they can order
  from."
- **Three-part structure:**
  - `▭ Promotion Announcement` — "Midday Sips. Launches in 3 days — a lunchtime drinks flight at
    Rabbit Café. The 48-hour attention-grab that opens every product."
  - `▷ Hero — Uji Matcha` — "The cinematic 30-second film. Steam rising, the pour, the light through
    the Flower Valley glass. The cut that opens the drinks list."
  - `▤ Elite Carousel — 10 part` — "The full offering as a scrollable set. Ten cuts, each its own
    clip, every choice a guest can pick and buy."
- **The Set:** label `THE DRINKS`, title "Rabbit Café", right-meta "daily 09:00–17:00". Numbered
  list `01 Pure Matcha` … `10 Coconut Cake & Labaris Waffle`.
- **Pill:** `Apex Menu`
- **Footer:** `Apex Menu · Drinks · Announcement + Hero + 10-part Carousel · Hotel Labaris`

---

## VARIANT C — APEX LIVE UPDATE  (`Live Update · Conference`)

The one variant with a **utility register** — it's a safety-net product, so the copy is plainer and
the three-part structure uses feature rows about *behaviour*, not build tiers.

- **Hero:** `APEX LIVE UPDATE · ON THE DAY` / **Live Update** / `Web Summit · Conference`
- **Display headline:** "Everyone Stays in the Loop" + "Not a showcase — a safety net. When the
  schedule shifts, every delegate hears it in their own language. Required information, there as a
  precaution."
- **Three-part structure** (feature rows):
  - `◷ The Change` — "A room reassigned, a talk running late, a speaker pulled. The trigger is always
    **the schedule just changed**." (bold inline on the trigger phrase)
  - `◷ 3-Hour Turnaround` — "The reactive window. Something shifts, and inside three hours the
    corrected plan is in every delegate's hand."
  - `⊕ Every Language` — "Multilingual by default for an international floor. Digital drop and on-site
    signage carry the same versions, so no delegate is left guessing."
- **The Set:** label `THE UPDATES`, title "Web Summit · Conference", right-meta "3-hr · on the day".
  Numbered list `01 Room Reassigned` … `08 Schedule Reshuffle`.
- **Pill:** `Apex Live Update`
- **Footer:** `Apex Live Update · 3-hr turnaround · educational · informational · emergency · multilingual`

---

## VARIANT D — THE DISPLAYS  (`Format Architecture`)

The internal/architecture page — the one built from **card panels** rather than a simple numbered
list. This is the reference doc that explains the six delivery surfaces.

- **Hero:** `APEX DISPLAYS · FORMAT ARCHITECTURE` / **The Displays** / `How every product is shown`
- **Display headline:** "The Surfaces, Not the Subjects" + "Products decide *what* a film is about.
  Displays decide *how and where* it is shown. These are the six surfaces every product is delivered
  onto — from the flagship grid statement down to the permanent navigation tab."
- **Body:** six **card panels** (Doc 01 §6.3), each numbered, each with an italic `--accent` label
  right-aligned:
  - `01 Apex Billboard` — *the flagship container*
  - `02 Apex Announcement` — *the 48-hour grid-shift*
  - `03 Apex Story` — *the shareable layer*
  - `04 Apex Carousel` — *the golden piece*
  - `05 Apex Explore` — *the permanent showroom*
  - `06 Apex Highlight` — *the navigation tabs*
  - Each panel carries attribute rows (`UNIT`, `RUNTIME`, `DEPTH`, `FOCUS`, plus one product-specific
    row) in the `LABEL · value` pattern.
- **Footer:** `Apex Displays · Format Architecture · Billboard · Announcement · Story · Carousel ·
  Explore · Highlight`

---

## BUILD NOTES FOR THE TEMPLATES

- One React component `<ProductPage>` takes a config object (eyebrow, title, subtitle, headline,
  three-part items, set label/title/meta, list items, pill label, footer). The four variants are
  four config objects. The Displays page is a sibling `<ArchitecturePage>` using card panels.
- The feature-row icons are the only per-product art — outline, 1.5px, from a single icon set
  (Lucide fits the system: `clock`, `globe`, `credit-card`, `play`, `file-text`).
- These pages are **static-content deliverables**, not driven by the clip database — but they use the
  identical token system, so the library site and the product pages are unmistakably one brand.
- Amber accent appears **only** on the Displays italic labels and nowhere else across all four.
