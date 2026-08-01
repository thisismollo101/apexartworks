#!/usr/bin/env bash
#
# Apply the generated library load to Supabase, in order, stopping on the
# first error.
#
# The load is ~3.7 MB of SQL across 20 chunks — far too much to push through
# an agent tool call, so it is applied here with psql instead.
#
#   npm run build-library-load     # regenerate out/library_load_*.sql
#   DATABASE_URL=... npm run apply-library-load
#
# DATABASE_URL is the Postgres connection string from
# Supabase → Project Settings → Database → Connection string → URI.
# Use the SESSION pooler (port 5432); the transaction pooler rejects the
# multi-statement files.
#
# Safe to re-run: every insert is `on conflict … do nothing`, so a repeat pass
# adds nothing and overwrites nothing. That guard is what protects the clips
# whose titles a model wrote — this load can only ever ADD rows.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL to the Supabase Postgres connection string}"

cd "$(dirname "$0")/../.."
shopt -s nullglob
chunks=(out/library_load_*.sql)

if [ ${#chunks[@]} -eq 0 ]; then
  echo "No chunks found. Run: npm run build-library-load" >&2
  exit 1
fi

echo "Applying ${#chunks[@]} chunk(s)…"
for f in "${chunks[@]}"; do
  printf '  → %s ' "$f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
  echo "ok"
done

echo
echo "Loaded. Now re-derive the browse facets over the enlarged library:"
echo "  psql \"\$DATABASE_URL\" -f supabase/migrations/0005_tighten_drink_vocab.sql"
echo "  psql \"\$DATABASE_URL\" -f supabase/migrations/0008_hero_based_categories.sql"
