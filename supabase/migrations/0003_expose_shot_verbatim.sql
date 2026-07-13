-- ============================================================================
-- Expose shot.verbatim_text on the public client surface.
--
-- OWNER OVERRIDE (Aidan, 2026-07-13): the per-shot verbatim prompt — the
-- original protected IP — is now shown publicly on the clip page, next to the
-- English description, per explicit request. This adds verbatim_text to the
-- client_shots view. This removes the wall's protection of the shot prompt IP;
-- it is a deliberate, owner-authorised change. Idempotent.
-- ============================================================================

create or replace view client_shots as
select
  s.clip_id,
  s.shot_index,
  s.description,
  s.shot_deeplink,
  s.verbatim_text     -- now client-facing, per owner override
from shots s
join clips c on c.clip_id = s.clip_id
where c.verdict = 'keep';

grant select on client_shots to anon, authenticated;
