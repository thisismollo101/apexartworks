# Apex Clip Database — apexartworks.com

The searchable hospitality clip library ("Ads of the World for AI hospitality video").
Authoritative brief: **docs/APEX_PRD.md**. Design system: **docs/design/**.

Two things must never drift:

1. **The Gate** — an LLM classifier that judges every raw prompt: child-safety
   FLOOR → grounded/brand-safe → hospitality home → authenticity. Cuts die
   whole; only keepers are decomposed into shots. `pipeline/`.
2. **The Visibility Wall** — `shot.verbatim_text` (the prompt IP), the internal
   tags, the gate fields, and `source_url` are unreachable by a client through
   any route. Enforced in the database (RLS deny-all + client views,
   `supabase/migrations/0001_init.sql`) and again in the API layer
   (`src/lib/wall.ts` allowlists). Audit: `scripts/wall-audit.ts`.

## Stack

Next.js (App Router, TS, Tailwind) · Supabase Postgres (server-side only) ·
Claude API (the gate) · Vercel · apexartworks.com

## Setup

```sh
npm install
cp .env.example .env.local   # fill in Supabase + Anthropic credentials
```

1. **Database** — run `supabase/migrations/0001_init.sql` in the Supabase SQL
   editor, then verify the wall queries at the bottom of that file.
2. **Demo seed (optional)** — `npx tsx scripts/seed-demo.ts` loads the 17
   calibration clips + 103 shots (marked `is_demo_seed`).
3. **Regression** — `npx tsx pipeline/regression.ts` must be fully green
   before gating the library. If the classifier disagrees with a fixture,
   the classifier is wrong, not the ruling.
4. **Ingest** — `npx tsx pipeline/ingest.ts` gates all 3,414 rows of
   `data/apex_source_library.csv` (checkpointed in `out/`; resumable), then
   decomposes the keepers and loads Supabase. Low-confidence verdicts land in
   `out/review_pile.csv` for Aidan — flagged, never silently decided.
   Child-safety floor cuts are logged by `video_id` only.
5. **Run** — `npm run dev` · wall audit: `npx tsx scripts/wall-audit.ts --site http://localhost:3000`

## Deploy

Vercel project + env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), then
`vercel deploy --prod` and attach `apexartworks.com` (DNS already points at
Vercel). Re-run the wall audit against production before announcing.

## Open items (Aidan's calls — do not resolve in code)

Halloween/occasion rule · the contested super-speed commercial · video asset
population (`video_url` empty ⇒ deeplinks null) · template families ·
semantic search.
