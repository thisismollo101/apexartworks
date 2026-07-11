# APEX DESIGN SYSTEM — 04 · THE REVOLUT DISCIPLINE LAYER

How Revolut *behaves*, applied on top of Apex's *look*. Read after Docs 01–03.

**The one-line principle:** keep Apex's black cinematic skin (Docs 01–03); adopt Revolut's structural
discipline (this doc). We take Revolut's **behaviour and rigour**, never its palette. Revolut's own
site is white, glossy, and colourful — Apex is true black and austere. The look stays Apex. The
discipline comes from Revolut.

---

## WHAT WE TAKE FROM REVOLUT (and what we refuse)

| Take (structure / behaviour) | Refuse (their look) |
|---|---|
| One section = one idea = one action | White background |
| Big headline + one short subline + single CTA | Glossy 3D product photography |
| Modular stacked full-bleed sections you scroll | Bright gradients, colour blocks |
| Product shown **in motion** (for us: the embedded clip) | Consumer-friendly rounded warmth |
| Ruthless whitespace, tight type, plain sentence-case copy | Device mockups, hands-holding-phone imagery |
| Tabbed/rotating showcases to switch context | Multiple competing CTAs per screen |
| Restraint — nothing on screen that isn't doing a job | — |

If a choice makes the page feel more like a friendly bank, reject it. If it makes the page calmer,
clearer, and more confident, it's the Revolut discipline working.

---

## THE SEVEN DISCIPLINES

### 1. One section, one idea, one action
Every scroll section states a single idea and offers exactly one thing to do. Revolut never puts two
CTAs in a section ("Save with 5% AER → Explore Savings", full stop). Apply everywhere:
- Home hero → one action ("Browse the library").
- A clip → one action ("Select this film").
- Never a section with "Browse *and* Sign up *and* Learn more." Cut to one.

### 2. Headline + subline + action, in that rhythm
The Revolut section skeleton, which your four screens already follow:
```
   Big bold headline (one line, poster weight)
   One or two lines of plain subline (--text-secondary)
   [ one pill action ]
```
Keep sublines to ≤2 lines. If it needs three, the idea isn't sharp enough — cut it.

### 3. Modular stacked sections
The page is a vertical stack of self-contained full-width sections, each with its own quiet hero
moment, separated by generous space (96px). You scroll through discrete statements, not a dense
document. Each section could almost stand alone as a card. No multi-column dashboards.

### 4. Show the product in motion
Revolut sells by showing the card tapping, the app swiping, money moving — short looping motion, not
static screenshots. Apex's equivalent is **the clip itself**. So:
- The clip page leads with the **embedded, playing video** — the product demonstrating itself.
- Grid cards can preview motion on hover (a muted 2–3s autoplay loop of the clip) — the Revolut
  "product in motion" instinct, done in Apex black. Respect `prefers-reduced-motion` (static thumb).
- Never a still where motion would show the product better.

### 5. Tabbed / rotating showcase
Revolut switches context with tabs (Adventure/Wedding/Moving; Physical/Virtual cards). Apex uses the
same pattern for **browsing by category** without leaving the page:
```
   food · drinks · venue · aerial · cinematic          ← tabs, not a dropdown
   [ grid re-renders under the active tab ]
```
One active tab at a time, underlined in `--text`, others `--text-muted`. Instant re-render, no reload.
This is the calm, confident way to let someone browse 650 clips without a filter panel.

### 6. Plain, active, sentence-case copy
Revolut writes "Spend smartly, send quickly" — plain verbs, no jargon, no hype. Apply to every string:
- Buttons say what happens: "Select this film", "Browse the library", "Save selection".
- The action keeps its name through the flow: a "Select" button produces a "Selected" state.
- Empty/error states give direction, not mood: "No films match *pasta* yet. Try food or a venue."
- No exclamation-mark hype in the library UI (the product *template* pages keep their "Sells Itself!"
  headlines — that's client marketing copy; the library tool itself stays quieter).

### 7. Ruthless subtraction
Revolut's power is what's *absent* — no clutter, no secondary noise, one focus per view. Chanel's
rule: remove one thing before shipping each screen. On the clip page this is already doing heavy
lifting (no prompt, no tags, no author — just the film, its beats, one action). Extend it everywhere:
if an element isn't the idea or the action, cut it.

---

## APPLYING IT TO THE LIBRARY (the priority build)

**Home** becomes a Revolut-style vertical stack, in Apex black:
```
SECTION 1  Sunburst hero — Apex Artworks / one subline / [Browse the library]
SECTION 2  Search — one bold prompt "Find your film", the bar, category tabs (§5)
SECTION 3  The grid — cards with motion-on-hover (§4), distinctiveness-ordered
SECTION 4  A single closing statement + [Browse the library]
FOOTER     tag breadcrumb
```
Each section: one idea, one action, big headline, generous space. Scrolling it should feel like
Revolut's home — calm, confident, one thing at a time — but rendered in Apex's black cinematic skin.

**Clip page** is already Revolut-disciplined: one product (the film), shown in motion (embedded,
playing), one action (select). Hold it there. Don't add cross-sell, related-clips rails, or a second
CTA — that would be the un-Revolut move.

---

## MOTION BUDGET (Revolut is animated but never busy)
Revolut uses motion constantly but it always *shows the product*, never decorates. Our budget:
- Sunburst draw-in on load (once). Section fade-up on scroll (once, subtle).
- **Clip motion** is the main animation — hover-preview on cards, the playing video on the clip page.
  This is the Revolut "product in motion" principle carrying the page's energy.
- Nothing else moves. No floating shapes, no parallax, no looping ambient effects. The clips are the
  motion; the frame around them stays still.

---

## THE TEST (before shipping any screen)
1. Does this section have exactly one idea and one action? (Revolut) → if no, cut.
2. Is it black, austere, type-led — not white/glossy? (Apex) → if no, it drifted to Revolut's look.
3. Is the product shown in motion where motion helps? (Revolut) → if a still would be weaker, use the clip.
4. Could I remove one more thing? (both) → then remove it.

Pass all four and the screen is on-brand: Apex's identity, Revolut's discipline.
