-- ============================================================================
-- APEX CLIP DATABASE — Supabase / Postgres schema  (v1)
-- Adopted from Aidan's schema.sql draft, extended with client_selection,
-- floor_log, and full-text search indexes.
--
-- THE ONE THING THIS FILE EXISTS TO GUARANTEE:
--   A client can never, by any query, retrieve shot.verbatim_text (the IP),
--   the internal tags, the gate fields, or source_url.
--   This is enforced in the DATABASE, not the app. It cannot be bypassed
--   from the front-end because the columns are not reachable through the
--   role the front-end uses.
-- ============================================================================

-- ---------------------------------------------------------------- MASTER TABLES
-- Full data. Reachable ONLY by the service_role (server-side backend + the
-- dashboard). Never exposed to the public app.

create table if not exists clips (
  clip_id                    text primary key,
  video_id                   text unique,   -- source library row id (null for demo seeds)
  title                      text,
  generator                  text,
  runtime_s                  numeric,
  aspect_ratio               text,
  video_url                  text,
  thumbnail_url              text,
  source_url                 text,          -- INTERNAL: never client-facing
  asset_status               text,
  shot_count                 int,
  summary                    text,
  source_prompt_file         text,          -- INTERNAL
  verbatim_prompt            text,          -- INTERNAL: the full raw prompt (IP)
  verdict                    text,          -- INTERNAL (gate)
  step1_grounded_brand_safe  text,          -- INTERNAL
  home_route                 text,          -- INTERNAL
  cut_reason                 text,          -- INTERNAL
  occasion_context           text,          -- INTERNAL  [Halloween rule UNSET]
  distinctiveness            text,          -- INTERNAL
  register                   text,          -- INTERNAL
  product_fit                text,          -- INTERNAL
  realism_level              text,          -- INTERNAL (style fingerprint)
  render_stack               text,          -- INTERNAL
  grade                      text,          -- INTERNAL
  motion_feel                text,          -- INTERNAL
  prompt_health              text,          -- INTERNAL
  risk_flags                 text,          -- INTERNAL
  ip_flags                   text,          -- INTERNAL
  fix_note                   text,          -- INTERNAL
  calibration_note           text,          -- INTERNAL
  gate_confidence            numeric,       -- INTERNAL (classifier confidence)
  gate_notes                 text,          -- INTERNAL (classifier reasoning)
  is_demo_seed               boolean default false,
  created_at                 timestamptz default now()
);

create table if not exists shots (
  shot_id           text primary key,
  clip_id           text references clips(clip_id) on delete cascade,
  shot_index        int,
  tc_in             numeric,
  tc_out            numeric,
  duration_s        numeric,
  verbatim_text     text,     -- ****** THE IP. INTERNAL-ONLY. NEVER EXPOSE ******
  description       text,     -- client-facing
  shot_deeplink     text,     -- client-facing
  subject_role      text,     -- INTERNAL
  action            text,     -- INTERNAL (search axis)
  food_item         text,     -- INTERNAL
  food_role         text,     -- INTERNAL
  setting           text,     -- INTERNAL
  camera_framing    text,     -- INTERNAL
  camera_angle      text,     -- INTERNAL
  camera_movement   text,     -- INTERNAL (search axis)
  motion_speed      text,     -- INTERNAL
  lighting          text,     -- INTERNAL
  vfx               text,     -- INTERNAL
  audio_sfx         text,     -- INTERNAL
  dialogue          text,     -- INTERNAL
  mood              text,     -- INTERNAL
  liftable          text,     -- INTERNAL
  shot_risk         text      -- INTERNAL
);

-- Client beat selections (the flywheel trigger). Written ONLY by the server
-- route with the service role; never readable or writable by anon.
create table if not exists client_selection (
  id            uuid primary key default gen_random_uuid(),
  clip_id       text references clips(clip_id) on delete cascade,
  shot_indexes  int[] not null,
  client_name   text,
  client_email  text,
  note          text,
  created_at    timestamptz default now()
);

-- Child-safety floor cuts are logged by video_id ONLY (PRD §2 FLOOR).
-- No prompt text, no source URL, nothing else is retained.
create table if not exists floor_log (
  video_id    text primary key,
  created_at  timestamptz default now()
);

create index if not exists idx_shots_clip         on shots(clip_id);
create index if not exists idx_shots_action       on shots(action);
create index if not exists idx_shots_camera_move  on shots(camera_movement);
create index if not exists idx_shots_food_role    on shots(food_role);
create index if not exists idx_clips_verdict      on clips(verdict);

-- Two-layer search: full-text over client-safe text only
create index if not exists idx_clips_fts on clips
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '')));
create index if not exists idx_shots_fts on shots
  using gin (to_tsvector('english', coalesce(description, '')));

-- ---------------------------------------------------------------- LOCK THE TABLES
-- RLS on, with NO policies, means: no anon or authenticated user can read these
-- through the API. service_role bypasses RLS, so the backend and the dashboard
-- still see everything. This is the wall.

alter table clips enable row level security;
alter table shots enable row level security;
alter table client_selection enable row level security;
alter table floor_log enable row level security;
-- (deliberately no CREATE POLICY statements — that is what keeps them private)

revoke all on clips from anon, authenticated;
revoke all on shots from anon, authenticated;
revoke all on client_selection from anon, authenticated;
revoke all on floor_log from anon, authenticated;

-- ---------------------------------------------------------------- CLIENT VIEWS
-- The ONLY thing the public app can read. They physically cannot select the IP
-- columns because those columns are not in the view. Views run with the owner's
-- rights, so they can read the locked tables on the client's behalf — but only
-- the safe columns defined here ever come out.

create or replace view client_clips as
select
  clip_id,
  title,
  summary,
  runtime_s,
  aspect_ratio,
  shot_count,
  video_url,
  thumbnail_url
from clips
where verdict = 'keep';          -- cuts never surface to a client, ever

create or replace view client_shots as
select
  s.clip_id,
  s.shot_index,
  s.description,
  s.shot_deeplink
from shots s
join clips c on c.clip_id = s.clip_id
where c.verdict = 'keep';

grant select on client_clips  to anon, authenticated;
grant select on client_shots  to anon, authenticated;

-- ============================================================================
-- VERIFY THE WALL  (run these after importing data — do not skip)
--
-- As the SERVICE ROLE (SQL editor default) this returns the prompt:
--     select verbatim_text from shots limit 1;              -- ✅ you see it
--
-- Using the ANON key from your app, these MUST behave as:
--     select * from client_shots limit 1;                   -- ✅ description only
--     select verbatim_text from shots;                      -- ❌ permission denied
--     select verbatim_text from client_shots;               -- ❌ column does not exist
--
-- If the anon key can pull verbatim_text by ANY route, STOP — the wall is broken.
-- ============================================================================
