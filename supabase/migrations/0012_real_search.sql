-- ============================================================================
-- Search that actually means what it says.
--
-- Three defects, all visible on Aidan's own examples:
--
--  1. THE PROMPT WAS NEVER SEARCHED. searchClips() reads title, summary and
--     shot description only. The richest text we hold — clips.verbatim_prompt,
--     already client-facing since 0009 — was invisible to it. Search "car" and
--     a film whose prompt is full of cars does not come back.
--
--  2. SUBSTRING, NOT WORDS. It matched %car%, so "card", "scar", "carry" and
--     "Carnival" all counted as a car.
--
--  3. MULTI-WORD MEANT *ANY* WORD. "girl eating" returned everything
--     containing "girl" OR "eating" — a girl on a motorbike ranked as a hit.
--
-- The fix is a real full-text index over everything a clip says: its title,
-- summary, the whole prompt, and every shot's description and verbatim text.
-- English stemming means "eating" finds "eat"/"eats", which substring matching
-- could never do, and to_tsquery's AND semantics mean every word must be
-- present — "girl eating" needs both.
--
-- WEIGHTING. Title and summary carry weight A, the prompt B, the shot text C,
-- so a film ABOUT pizza outranks one that mentions pizza once in a shot.
--
-- THE WALL. search_clips() is SECURITY DEFINER because the master tables are
-- RLS deny-all and anon must never read them directly. It is therefore written
-- to be incapable of leaking: it selects a FIXED list of the same columns
-- client_clips exposes, filters verdict='keep' exactly as that view does, and
-- pins search_path. No internal column is named anywhere in its body.
-- ============================================================================

-- ---- the searchable document ----------------------------------------------
alter table clips add column if not exists search_text text;

/**
 * Rebuild the search document. Separate function rather than a generated
 * column because the text spans two tables — a clip's shots live in `shots`,
 * and a generated column cannot read them. Re-run after any bulk load.
 */
create or replace function public.refresh_search_text()
returns bigint language plpgsql as $fn$
declare n bigint;
begin
  with doc as (
    select c.clip_id,
           coalesce(c.title,'')   as t,
           coalesce(c.summary,'') as s,
           coalesce(c.verbatim_prompt,'') as p,
           coalesce((
             select string_agg(coalesce(sh.description,'') || ' ' || coalesce(sh.verbatim_text,''), ' ')
             from shots sh where sh.clip_id = c.clip_id
           ),'') as sh
    from clips c
  )
  update clips c
     set search_text = doc.t || ' || ' || doc.s || ' || ' || doc.p || ' || ' || doc.sh
    from doc where doc.clip_id = c.clip_id;
  get diagnostics n = row_count;
  return n;
end
$fn$;

select public.refresh_search_text();

-- Weighted vector: what the film IS beats what it merely mentions.
alter table clips drop column if exists search_doc;
alter table clips add column search_doc tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title,'')),   'A') ||
    setweight(to_tsvector('english', coalesce(summary,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(verbatim_prompt,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(search_text,'')), 'C')
  ) stored;

create index if not exists idx_clips_search_doc on clips using gin (search_doc);
-- Trigram index backs the fallback for words English stemming will not join
-- (brand names, "halloween"-style proper nouns typed in odd case).
create extension if not exists pg_trgm with schema extensions;
create index if not exists idx_clips_search_text_trgm
  on clips using gin (search_text extensions.gin_trgm_ops);

-- ---- the search entry point ------------------------------------------------
drop function if exists public.search_clips(text, int);

create function public.search_clips(q text, lim int default 60)
returns table (
  clip_id text, title text, summary text, runtime_s int, aspect_ratio text,
  shot_count int, video_url text, thumbnail_url text, source_url text,
  categories text[], verbatim_prompt text, author_name text, author_url text,
  license text, license_url text, match_hint text
)
language sql stable security definer set search_path = public, extensions as $fn$
  with parsed as (
    select nullif(btrim(q), '') as raw,
           websearch_to_tsquery('english', coalesce(q,'')) as tsq
  ),
  hits as (
    select c.*,
           ts_rank_cd(c.search_doc, p.tsq) as rank,
           -- did every word land in the title/summary, or only deeper in?
           (c.search_doc @@ p.tsq) as matched
    from clips c, parsed p
    where c.verdict = 'keep'
      and p.tsq is not null
      and c.search_doc @@ p.tsq
  )
  select h.clip_id, h.title, h.summary, h.runtime_s, h.aspect_ratio,
         h.shot_count, h.video_url, h.thumbnail_url, h.source_url,
         h.categories, h.verbatim_prompt, h.author_name, h.author_url,
         h.license, h.license_url,
         case
           when h.title   ilike '%' || (select raw from parsed) || '%'
             or h.summary ilike '%' || (select raw from parsed) || '%' then null
           else 'matches the prompt'
         end as match_hint
  from hits h
  order by h.rank desc, h.clip_id
  limit greatest(1, least(coalesce(lim, 60), 200));
$fn$;

comment on function public.search_clips(text, int) is
  'Client-facing search. SECURITY DEFINER over RLS-denied tables, so it selects a fixed client-safe column list and filters verdict=keep, exactly like client_clips.';

revoke all on function public.search_clips(text, int) from public;
grant execute on function public.search_clips(text, int) to anon, authenticated;
-- refresh_search_text is maintenance, never client-facing.
revoke all on function public.refresh_search_text() from public, anon, authenticated;
