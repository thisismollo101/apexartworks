-- ============================================================================
-- Attribution for imported prompts — a LICENCE OBLIGATION, not a preference.
--
-- The second collection (YouMind-OpenLab/awesome-seedance-2-prompts) is
-- published under CC BY 4.0, which permits sharing and adaptation ONLY with
-- credit to the author. Every entry in it names its author and links their
-- account, so we can carry that credit; not carrying it would put the library
-- outside the licence it relies on.
--
-- These are NEW columns, not internal ones being downgraded. Unlike 0002/0003/
-- 0009 this is not an owner override of the wall: nothing that was ever
-- protected becomes visible. The wall's posture is unchanged.
--
-- Kept as structured columns rather than folded into title/summary so the
-- credit can be rendered, audited, and removed on a takedown request — the
-- upstream collection carries its own takedown notice, and we should be able
-- to honour one without rewriting prose.
--
-- The existing 766 clips have these columns NULL, so nothing about them
-- changes and no credit line renders for them.
--
-- Idempotent. Replaces the view definition from 0009.
-- ============================================================================

alter table clips
  add column if not exists author_name text,
  add column if not exists author_url  text,
  add column if not exists license     text,
  add column if not exists license_url text;

comment on column clips.author_name is
  'Prompt author, as credited by the source collection. Required when license is set.';
comment on column clips.license is
  'Licence of the PROMPT text, e.g. "CC BY 4.0". NULL for our own originals.';

-- New columns are appended: `create or replace view` cannot reorder or drop
-- columns, and forcing a `drop view` would cascade to the grants.
create or replace view client_clips as
select
  c.clip_id,
  c.title,
  c.summary,
  c.runtime_s,
  c.aspect_ratio,
  c.shot_count,
  c.video_url,
  c.thumbnail_url,
  c.source_url,
  c.categories,
  c.verbatim_prompt,
  c.author_name,   -- attribution (this migration)
  c.author_url,
  c.license,
  c.license_url
from clips c
where c.verdict = 'keep';

grant select on client_clips to anon, authenticated;
