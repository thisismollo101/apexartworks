-- ============================================================================
-- Expose source_url on the public client surface.
--
-- OWNER OVERRIDE (Aidan, 2026-07-13): the original design kept source_url
-- internal (provenance / IP). With no hosted video_url assets yet, the owner
-- has chosen to surface the original source link publicly as the watchable
-- link. This adds source_url to the client_clips view; the wall's other
-- guarantees (verbatim_text, gate fields, internal tags stay hidden) are
-- unchanged. Idempotent.
-- ============================================================================

create or replace view client_clips as
select
  clip_id,
  title,
  summary,
  runtime_s,
  aspect_ratio,
  shot_count,
  video_url,
  thumbnail_url,
  source_url          -- now client-facing, per owner override
from clips
where verdict = 'keep';

grant select on client_clips to anon, authenticated;
