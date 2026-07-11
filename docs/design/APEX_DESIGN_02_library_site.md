# APEX DESIGN SYSTEM — 02 · THE LIBRARY SITE (apexartworks.com)

The searchable clip library — "Ads of the World for AI hospitality video." Inherits every token and
component from Doc 01. This is the **priority build** and the surface going to Claude Code. Three
pages: Home/Grid, Search results, Clip detail. Plus the client selection flow.

Reminder of the two hard rules from the PRD, expressed here as design constraints:
- **Only `verdict=keep` clips ever render.** Cuts do not exist to the client.
- **The client sees the shot `description`, never `verbatim_text`.** The prompt is invisible on every
  screen. There is no UI anywhere that displays a prompt.

---

## PAGE 1 — HOME / GRID  `/`

The Ads-of-the-World grid, in Apex black.

```
┌───────────────────────────────────────────────┐
│              ·  ·  sunburst  ·  ·               │
│            APEX ARTWORKS · LIBRARY              │   ← hero (Doc 01 §5)
│                 Apex Artworks                   │
│         The hospitality film library            │
│                                                 │
│   ┌─────────────────────────────────────────┐   │
│   │  ⌕  Search — food, pasta, drone, sunset  │   │   ← search bar, prominent
│   └─────────────────────────────────────────┘   │
│   food · drinks · venue · cinematic · aerial     │   ← quick filter chips (muted)
│                                                 │
│   THE LIBRARY              650 films · updated…  │   ← section label + count
│   ┌────────┐ ┌────────┐ ┌────────┐              │
│   │ thumb  │ │ thumb  │ │ thumb  │              │
│   │        │ │        │ │        │              │   ← responsive card grid
│   │ Title  │ │ Title  │ │ Title  │              │
│   │ summary│ │ summary│ │ summary│              │
│   │ 15s·5sh│ │ 12s·6sh│ │ 60s·4sh│              │
│   └────────┘ └────────┘ └────────┘              │
│        … infinite scroll / paginate …           │
│                                                 │
│              [  Browse the library  ]           │   ← pill (Doc 01 §6.4)
│     Apex Artworks · hospitality film library     │   ← footer breadcrumb
└───────────────────────────────────────────────┘
```

**Hero:** sunburst, eyebrow `APEX ARTWORKS · LIBRARY`, title `Apex Artworks`, subtitle
`The hospitality film library`.

**Search bar:** full-width under the hero, `--surface` fill, `--hairline` border, 12px radius, a
thin ⌕ icon left, placeholder cycling through real terms (`food` → `pasta` → `drone` → `golden hour`).
Prominent — this is the product. Focus: border brightens to `--text-muted`, no colour.

**Quick chips:** a muted row of the most common terms below the bar. Tap = runs that search. These
are the broad→specific on-ramps (`food` is a chip; typing `pasta` narrows).

**Clip card:**
- Thumbnail (16:9, the clip's `thumbnail_url`), 12px radius, fills the card top.
- Below, on `--surface`: **title** (list-item-title weight), one-line **summary**
  (`--text-secondary`, truncated), and a muted metadata line: `15s · 5 shots`.
- Hover: card lifts to `--surface-hover`, thumbnail scales 1.02 inside its clip mask, 150ms.
- **Distinctiveness governs order:** `high` leads, `low` never appears above `standard`. Weak-but-
  valid clips exist in the grid but never lead it.
- Card is a single link → `/clip/[clipId]`.

**Grid:** 3-up desktop, 2-up tablet, 1-up mobile. `24px` gap. Lazy-load, infinite scroll or a
"Browse" pill that pages.

**Empty/loading:** skeleton cards in `--surface` (no spinner). Empty search: "No films match *term*
yet. Try food, drinks, or a venue." — direction, not apology (Doc 01 voice).

---

## PAGE 2 — SEARCH RESULTS  `/search?q=`

Same grid, re-topped. The search bar moves up (hero collapses to a slim title bar with a small
static sunburst mark), the query echoes as the section label.

```
│  ⌕ pasta                                  ✕      │   ← persistent search, filled with query
│  RESULTS FOR “PASTA”            18 films          │   ← section label + count
│  [ grid of matching cards ]                       │
```

- **Matching logic (design-visible behaviour):** a card appears if the query matches the clip title,
  the summary, OR any of its shot `description`s. This is the two-layer safety net — a pasta clip
  surfaces whether it was tagged `food_item=pasta` or merely *described* as twirling pasta. The user
  never sees the mechanism; they just see that search "works."
- **Broad→specific:** `food` returns everything with a food home; `pasta` returns the subset. Chips
  and free text behave identically.
- Results ranked by distinctiveness, then relevance.
- Each result card can show a hairline **match hint** under the metadata when the match came from a
  shot ("matches shot 3 · plating"), so the user understands *why* it surfaced. Muted, optional.

---

## PAGE 3 — CLIP DETAIL  `/clip/[clipId]`

The heart of the product. Video embedded, shots listed as the numbered pattern, each selectable.

```
┌───────────────────────────────────────────────┐
│   ←  Back to library                            │
│                                                 │
│   ┌─────────────────────────────────────────┐   │
│   │                                         │   │
│   │            ▶  embedded video            │   │   ← dominant, 16:9, plays in page
│   │                                         │   │
│   └─────────────────────────────────────────┘   │
│                                                 │
│   Still Hot — Tokyo Ramen Sprint                │   ← clip title (section-title weight)
│   A street chef sprints a bowl of ramen         │   ← summary (--text-secondary)
│   through neon Tokyo. 13s · 5 shots             │   ← metadata
│                                                 │
│   THE SHOTS                    select the beats  │   ← section label + hint
│   ┌───────────────────────────────────────┐     │
│   │ 01  Sprint through the alley       ⌾  │     │   ← numbered list + select control
│   │     A chef runs flat-out holding…      │     │
│   ├───────────────────────────────────────┤     │
│   │ 02  Crates burst                   ⌾  │     │
│   │     Vegetables and chopsticks fly…     │     │
│   ├───────────────────────────────────────┤     │
│   │ 03  Mid-air garnish  [drone]       ⦿  │     │   ← selected: filled, left border
│   │     She garnishes the bowl mid-leap    │     │
│   └───────────────────────────────────────┘     │
│                                                 │
│   [  Select this film  ]   3 shots chosen        │   ← pill + running count
│                                                 │
└───────────────────────────────────────────────┘
```

**Video:** embedded player, 16:9, dominant, top of page, 16px radius. Plays **in the page** — the
`x.com` source is never linked or shown. (`source_url` is internal; the client watches here.)

**Header:** clip title, summary, `runtime · shot count`. No prompt, no tags, no author, no source.

**The shot list (the shot-selection interaction — the flywheel):**
- Renders the numbered-list component (Doc 01 §6.1, interactive variant). One row per shot,
  ordered by `shot_index`.
- Each row: number · **shot title** (a short human label) · **description** (`--text-secondary`,
  the plain-English beat — this is the ONLY per-shot text a client ever sees). A subtle right-side
  **select control** (a ring that fills when chosen).
- Optional muted inline tag chip where useful ("drone", "slow-mo") — drawn from client-safe fields
  only, never a prompt fragment.
- **Selecting a shot:** row lifts, control fills, a 2px `--text` left border appears. Runs client-
  side; no reload.
- **Select the whole film:** the foot pill toggles all shots; the count updates ("3 shots chosen",
  "whole film chosen").

**Save selection:** the pill is the commit. On tap → a light sheet asks name + email (optional),
then POSTs `{clip_id, shot_indexes, name, email}` to `/api/selections`. Confirmation is direction,
not celebration: "Saved — your 3 chosen beats are with the Apex team." This is the intake trigger.

**What is deliberately absent here:** the prompt, the tags, the gate verdict, the source URL, the
author. The page is beautiful precisely because it withholds the machinery. The client sees a film,
its beats in plain English, and a way to choose. Nothing else.

---

## THE INTERNAL SURFACE (staff only — not public, note for the build)

Separate, authenticated, server-side-rendered with the service-role key. Same visual system, but it
*does* show the internal layer: per-shot `verbatim_text` (the liftable prompt), all tags, the
recombination search ("drone + hero food" → returns shot rows with their prompt segments), the gate
verdict, the review queue of low-confidence rows. This is where the recombination engine lives. It
is never reachable from the public site and never ships client-safe fields' opposites to the browser.

Design note: mark the internal surface unmistakably — a persistent `INTERNAL` tag in the corner in
`--accent`, so no one confuses it with the client view and screenshots it into a client deck.

---

## RESPONSIVE

- **Mobile (375–767):** 1-up grid; hero title 40px; video full-bleed to side padding; shot rows
  stack the select control to the right, still 44px tap target; pill full-width sticky at the foot
  of the clip page.
- **Tablet (768–1023):** 2-up grid.
- **Desktop (1024+):** 3-up grid, 720px content column on the clip page (video may extend to 860px).
