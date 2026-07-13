-- ============================================================================
-- Real categories: tag-derived, multi-membership browse facets.
--
-- Owner decision (Aidan, 2026-07-13): the old category tabs were keyword
-- searches, so Venue/Event/Lifestyle looked nearly empty. This derives a
-- curated `categories text[]` on clips from the internal shot tags
-- (food_role, food_item, setting, subject_role, action, mood) + title/summary,
-- with 8 fixed values: food, beverage, venue, event, travel, characters,
-- action, lifestyle. Multi-membership; `lifestyle` doubles as the fallback so
-- every clip has at least one category.
--
-- The wall: only the derived `categories` array becomes client-facing (added
-- to client_clips). The raw tags it is computed from stay internal. RLS
-- posture is untouched.
--
-- Idempotent: the backfill recomputes every row, so re-run this after any
-- future bulk load to refresh categories.
-- ============================================================================

alter table clips add column if not exists categories text[] not null default '{}';

-- ---- backfill: recompute the full array for every clip --------------------
update clips c set categories = (
  select coalesce(array_agg(cat), '{}')
  from (
    -- FOOD: an edible item is the hero or featured in some shot
    select 'food' as cat
    where exists (
      select 1 from shots s
      where s.clip_id = c.clip_id
        and s.food_role in ('hero', 'featured')
        and s.food_item is not null
        and s.food_item !~* '\m(coffee|latte|espresso|cappuccino|mocha|matcha|tea|boba|soda|cola|juice|smoothie|milkshake|cocktail|wine|beer|sake|champagne|lemonade|milk|cocoa|drink|beverage|brew)\M'
    )

    union all
    -- BEVERAGE: a drink item appears in some shot, or a barista is the subject
    select 'beverage'
    where exists (
      select 1 from shots s
      where s.clip_id = c.clip_id
        and (
          s.food_item ~* '\m(coffee|latte|espresso|cappuccino|mocha|matcha|tea|boba|soda|cola|juice|smoothie|milkshake|cocktail|wine|beer|sake|champagne|lemonade|cocoa|drink|beverage|brew)\M'
          or s.subject_role = 'barista'
        )
    )

    union all
    -- VENUE: a hospitality venue is a setting in some shot
    select 'venue'
    where exists (
      select 1 from shots s
      where s.clip_id = c.clip_id
        and s.setting ~* '\m(restaurant|caf(e|é)|bar|bistro|diner|kitchen|bakery|patisserie|hotel|izakaya|ramen|noodle|sushi|pizzeria|steakhouse|deli|taqueria|brasserie|eatery|food (stall|truck|market|court)|market|tearoom|tea house|pub|tavern|cafeteria|canteen|banquet|dining|lounge|buffet|brewery|winery|rooftop (bar|table))\M'
    )

    union all
    -- EVENT: festivals, concerts, weddings, celebrations
    select 'event'
    where exists (
      select 1 from shots s
      where s.clip_id = c.clip_id
        and s.setting ~* '\m(festival|concert|stage|wedding|party|celebration|parade|firework|fireworks|new year|ceremony|carnival|gala|rave|dance floor|dj booth)\M'
    )
    or (coalesce(c.title,'') || ' ' || coalesce(c.summary,'')) ~* '\m(festival|concert|wedding|party|celebration|parade|firework|fireworks|new year|ceremony|carnival|gala)\M'

    union all
    -- TRAVEL & PLACES: cities, landmarks, nature settings
    select 'travel'
    where exists (
      select 1 from shots s
      where s.clip_id = c.clip_id
        and s.setting ~* '\m(city|street|alley|skyline|rooftop|temple|shrine|tower|bridge|harbou?r|beach|coast|mountain|forest|desert|canyon|village|plaza|square|waterfall|lake|river|ocean|cliff|glacier|island|countryside|downtown|station|train|airport|landmark|castle|palace|garden|park|tokyo|kyoto|osaka|paris|london|new york|rome|venice|dubai|asakusa)\M'
    )

    union all
    -- CHARACTERS & ANIMALS: animal characters carry the film
    select 'characters'
    where exists (
      select 1 from shots s
      where s.clip_id = c.clip_id and s.subject_role = 'animal-character'
    )

    union all
    -- ACTION: chases, races, stunts, courier/driver/agent films
    select 'action'
    where exists (
      select 1 from shots s
      where s.clip_id = c.clip_id
        and (
          s.subject_role in ('driver', 'courier', 'agent')
          or s.action ~* '\m(chase|race|racing|sprint|parkour|drift|heist|escape|stunt|pursuit|vault)\M'
        )
    )
    or (coalesce(c.title,'') || ' ' || coalesce(c.summary,'')) ~* '\m(chase|race|racing|sprint|parkour|drift|heist|escape|stunt|pursuit)\M'

    union all
    -- LIFESTYLE: everyday human scenes (guests/family, calm or playful)
    select 'lifestyle'
    where exists (
      select 1 from shots s
      where s.clip_id = c.clip_id
        and s.subject_role in ('guest', 'family')
        and s.mood in ('calm', 'playful')
    )
  ) t
);

-- fallback: no clip is ever orphaned from browse
update clips set categories = '{lifestyle}' where categories = '{}';

-- fast facet filtering on the client surface
create index if not exists idx_clips_categories
  on clips using gin (categories) where verdict = 'keep';

-- ---- widen the client view by exactly this one curated column -------------
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
  source_url,          -- client-facing per owner override (0002)
  categories           -- curated fixed-enum facets (this migration)
from clips
where verdict = 'keep';

grant select on client_clips to anon, authenticated;
