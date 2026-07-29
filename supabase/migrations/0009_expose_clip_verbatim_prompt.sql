-- ============================================================================
-- Expose clips.verbatim_prompt on the public client surface.
--
-- OWNER OVERRIDE (Aidan, 2026-07-29): the clip page already shows each shot's
-- verbatim prompt separately (0003). Per explicit request it must ALSO show the
-- whole prompt in one block, exactly as it was originally written — scene
-- headers, and the trailing "Style & Feel" / "Audio" directives.
--
-- Those global directives live only in clips.verbatim_prompt: across the
-- library the full prompt is consistently longer than the sum of its shots
-- (e.g. APX-C-005 is 3361 chars against 1027 of shot text), so joining the
-- per-shot rows cannot reconstruct it.
--
-- 0001 marked this column "INTERNAL: the full raw prompt (IP)". This makes it
-- client-facing. It is a deliberate, owner-authorised removal of that
-- protection, extending the same decision already taken for shot verbatim_text
-- and clip source_url. Everything else stays behind the wall: the internal
-- tags, the gate fields and prompt_health / source_prompt_file are unchanged.
--
-- Idempotent — replaces the view definition from 0004_categories.sql.
-- ============================================================================

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
  c.verbatim_prompt   -- now client-facing, per owner override
from clips c
where c.verdict = 'keep';

grant select on client_clips to anon, authenticated;
