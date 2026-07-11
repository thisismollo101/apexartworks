# APEX DESIGN SYSTEM — 01 · FOUNDATION

Extracted verbatim from the four live Apex screens (Stay, Drinks Menu, Live Update, The Displays).
This is the source of truth for every surface: the library site (apexartworks.com) and the product
templates both inherit from here. Discipline model: Revolut — true black, editorial type, generous
space, restraint, one signature element, motion used sparingly and precisely.

---

## 1. DESIGN THESIS (what makes this unmistakably Apex)

A **true-black cinematic canvas** with **poster-scale display headlines**, a **fine-line radiating
sunburst** behind every page title, and content organised as **numbered lists with hairline
dividers**. It reads like the title sequence of a film, not a SaaS dashboard. Colour is almost
absent — the drama is entirely type, black, and light.

**The signature element: the sunburst hero.** It appears once at the top of every page and nowhere
else. It is the one memorable thing; everything below it stays quiet.

---

## 2. COLOUR TOKENS

Near-monochrome by intent. The palette is black → white with three greys and a single restrained
amber accent used only for editorial labels.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#000000` | Page canvas. True black, not grey. |
| `--surface` | `#0A0A0B` | Raised cards (the Displays panels). Barely lifted. |
| `--surface-hover` | `#141416` | Card/list-row hover. |
| `--hairline` | `#1E1E20` | Dividers, card borders. ~12% white. |
| `--text` | `#FFFFFF` | Primary — titles, headlines, list names. |
| `--text-secondary` | `rgba(255,255,255,0.55)` | Descriptions, subtitles, body. |
| `--text-muted` | `rgba(255,255,255,0.32)` | Eyebrows, list numbers, footer, metadata. |
| `--accent` | `#C9A24B` | Amber. Editorial labels only ("the golden piece"). Never a button, never a link. |
| `--pill` | `#FFFFFF` | The one solid button. White fill, black text. |

**Rule:** if you're reaching for a colour that isn't on this list, stop. The system's power is its
restraint. No blues, no gradients on content, no coloured buttons. The amber is a seasoning, used
on maybe one label per page.

---

## 3. TYPOGRAPHY

One family, used across every weight. The screens use a tight-tracked grotesk; spec is **Inter**
(free, Google Fonts, renders identically, Vercel-safe). Swap the `--font` token if a brand face
arrives — nothing else changes.

```
--font: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

| Role | Size (desktop) | Weight | Tracking | Notes |
|---|---|---|---|---|
| **Display** ("A Room That Sells Itself!") | 56–72px | 800 | -0.03em | Poster scale. The emotional headline. Tight. |
| **Hero title** ("Stay", "Drinks Menu") | 40–56px | 700 | -0.02em | Centred in the sunburst. |
| **Eyebrow** ("APEX STAY · ROOMS") | 12px | 600 | +0.18em, UPPERCASE | `--text-muted`. Sits above the hero title. |
| **Section label** ("THE ROOMS", "THE DRINKS") | 12px | 600 | +0.16em, UPPERCASE | `--text-muted`. Opens a content block. |
| **Section title** ("Five Accommodation Types") | 26–32px | 700 | -0.01em | White. |
| **List item title** ("Pool Villa") | 17–19px | 700 | 0 | White. |
| **List item sub** ("300 sqm · private infinity pool") | 14–15px | 400 | 0 | `--text-secondary`. |
| **List number** (01, 02) | 13px | 600 | +0.05em | `--text-muted`, tabular. |
| **Body / subtitle** | 16–18px | 400 | 0 | `--text-secondary`. Line-height 1.5. |
| **Feature title** ("The Change") | 19px | 700 | 0 | White, beside an icon. |
| **Pill button** | 16px | 600 | 0 | Black on white. |

Type scale ratio ≈ 1.25. Sentence case everywhere except eyebrows and section labels (uppercase).

---

## 4. SPACING & LAYOUT

- **Grid:** single centred column, `max-width: 720px` for content pages; the library grid page
  widens to `1200px`. Side padding `24px` mobile, `32px`+ desktop.
- **Spacing scale (px):** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96. Use these, nothing between.
- **Vertical rhythm:** `96px` above each major section, `48px` below a section label to its content.
- **List rows:** `20–24px` vertical padding, separated by a `1px --hairline` divider. First row has
  a divider above, last row a divider below (the screens do this consistently).
- **Cards (Displays panels):** `--surface` fill, `1px --hairline` border, `16px` radius, `28px`
  internal padding.
- **Radius:** `16px` cards · `999px` pill button · `12px` inputs. Never sharp, never more than 16px
  on a rectangle.

---

## 5. THE SIGNATURE — SUNBURST HERO

The component that defines the brand. Every page opens with it.

**Anatomy (top to bottom):**
1. A **radiating line-burst**: 80–120 hairline rays emanating from behind the title, longest at the
   horizontal axis, fading to `--text-muted` at the tips, transparent at the outer edge. Pure CSS
   (conic/repeating gradient or an inline SVG of stroked lines). Sits behind the title, centred.
2. **Eyebrow** — uppercase tracked label (`APEX MENU · DRINKS`).
3. **Title** — the hero title (`Drinks Menu`).
4. **Subtitle** — thin, `--text-secondary` (`Rabbit Café · Hotel Labaris`).

**Behaviour:** on load, the rays draw/fade in over ~600ms and the title fades up 8px. Once. Never
loops. Respects `prefers-reduced-motion` (renders static). The burst is decorative — `aria-hidden`.

**Constraint:** the sunburst appears *only* in the hero. It is not a background texture, not a
divider, not a loading state. One per page.

---

## 6. COMPONENTS

### 6.1 Numbered list (the core content pattern)
The workhorse — used for rooms, drinks, updates, and (critically) **the shot list on a clip page**.

```
01   Pool Villa
     300 sqm · private infinity pool
──────────────────────────────────────
02   Duplex
     Multi-level suite · private outdoor space
```
- Number left (`--text-muted`, tabular, fixed 40px column), title + sub stacked right.
- Hairline divider between every row.
- Optional right-aligned metadata on the header row ("daily 09:00–17:00", "3-hr · on the day").
- **Interactive variant** (library clip page): the whole row is a hit target; a **select control**
  sits at the right. Hover lifts to `--surface-hover`. Selected state: a filled check + a 2px left
  border in `--text` (not amber — keep amber editorial-only).

### 6.2 Feature row (icon + title + description)
Used in Live Update ("The Change", "3-Hour Turnaround", "Every Language").
- Thin-stroke line icon (24px, `--text`) in a left column, title + `--text-secondary` description
  right. Divider between rows. Icons: outline style, 1.5px stroke, never filled.

### 6.3 Card panel (the Displays blocks)
- `--surface` fill, `--hairline` border, 16px radius. A numbered eyebrow + title on the top row,
  an italic `--accent` label right-aligned ("the golden piece"), then attribute rows
  (LABEL · value) inside.
- Attribute label: uppercase 11px `--text-muted`, fixed left column; value `--text-secondary`.

### 6.4 Pill button
- Full-width, white fill, black text, 999px radius, `18px` vertical padding. One per page, at the
  foot. Hover: dim to 92% opacity, no colour shift. This is the only solid button in the system.

### 6.5 Footer
- Centred, `--text-muted`, 13px, dot-separated breadcrumb of the page's tags
  ("Apex Menu · Drinks · Announcement + Hero + 10-part Carousel · Hotel Labaris").

---

## 7. MOTION

Revolut discipline: motion is precise and rare, never decorative.
- **Page load:** sunburst draws in + title fades up, once, ~600ms, eased `cubic-bezier(0.16,1,0.3,1)`.
- **Hover:** 150ms ease on cards/rows (`--surface` → `--surface-hover`), pill dim.
- **Scroll reveal:** content blocks fade up 12px as they enter, staggered 60ms, once. Subtle.
- **Never:** looping animation, parallax, bouncing, coloured glows, motion on the sunburst after load.
- `prefers-reduced-motion: reduce` → all of the above become instant.

---

## 8. QUALITY FLOOR (non-negotiable, unstated to the user)
Responsive to 375px · visible keyboard focus rings (2px `--text` offset) · reduced-motion respected
· contrast AA on all text (the greys above pass on black) · touch targets ≥44px · the sunburst is
`aria-hidden`, real headings use real `<h1>/<h2>`.

---

## 9. WHAT WOULD BREAK THE SYSTEM (guardrails)
- A coloured button, a gradient on content, or the amber used as anything but an editorial label.
- The sunburst repeated, tiled, or used as a background.
- Grey text below `0.55` opacity for anything a user must read.
- Sharp corners, or radius >16px on rectangles.
- More than one poster-scale display headline per page.
- Any second typeface. One family, many weights.
