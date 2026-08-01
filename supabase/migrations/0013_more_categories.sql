-- ============================================================================
-- Eight more browse categories.
--
-- Twelve categories over 1,596 films left real clusters with nowhere to sit —
-- the car films, the landscape films, the sci-fi films all landed in whatever
-- adjacent tab happened to catch them, or in lifestyle. Each of these was
-- measured against the corpus before being added; anything without a real
-- cluster was left out (horror matched 2 films, so there is no horror tab).
--
--   automotive 110   nature 152   tech 62   family 49
--   heritage 46      beauty 46    romance 38   scifi 36
--
-- Same standard as 0008 and 0011: a category is assigned only when at least
-- TWO DISTINCT terms from its vocabulary appear, so one passing mention of a
-- phone is not a tech film. Evidence is clips.search_text (0012), which spans
-- title, summary, the whole prompt and every shot — the full picture, not just
-- the headline.
--
-- ADDITIVE. Existing categories are untouched; these are appended to whatever
-- a clip already has. A film can be both travel and nature, which is correct.
-- And a clip that gains a real category here loses the bare 'lifestyle'
-- fallback, since that only ever meant "nothing else caught it".
--
-- Idempotent: recomputed from text on every run.
-- ============================================================================

with scored as (
  select c.clip_id, v.cat, (
    select count(distinct lower(m[1]))
    from regexp_matches(coalesce(c.search_text,''), v.rx, 'gi') m
  ) as n
  from clips c
  cross join (values
    ('automotive', '\m(car|cars|supercar|sports car|driving|driver|motorcycle|motorbike|racing|race track|engine|steering wheel|dashboard|highway|drift|garage|automotive|vehicle|truck|rally)\M'),
    ('nature',     '\m(forest|mountain|ocean|wildlife|jungle|desert|waterfall|glacier|canyon|savanna|coral|rainforest|wilderness|landscape|sunrise|sunset|storm|snow)\M'),
    ('tech',       '\m(smartphone|laptop|computer|screen|app|software|drone|gadget|device|ai|artificial intelligence|circuit|server|coding|robotics)\M'),
    ('family',     '\m(child|children|kid|kids|baby|toddler|boy|girl|school|playground|classroom|father|mother|grandmother|grandfather|family)\M'),
    ('heritage',   '\m(temple|shrine|monk|ritual|tradition|traditional|heritage|folk|ancient|dynasty|calligraphy|kimono|hanfu|sari|ceremony)\M'),
    ('beauty',     '\m(skincare|makeup|cosmetics|spa|massage|yoga|meditation|wellness|salon|haircut|barber|manicure|facial|serum|lotion)\M'),
    ('romance',    '\m(romance|romantic|love|lovers|couple|kiss|kissing|date night|proposal|embrace|tender|intimate|affection)\M'),
    ('scifi',      '\m(robot|android|cyborg|spaceship|spacecraft|alien|futuristic|cyberpunk|hologram|holographic|sci-fi|dystopian|mech|starship|galaxy|orbit)\M')
  ) as v(cat, rx)
),
winners as (
  select clip_id, array_agg(cat order by cat) as cats
  from scored where n >= 2 group by clip_id
)
update clips c
set categories = (
  select array(select distinct x from unnest(
    -- 'lifestyle' only ever meant "nothing caught this"; a real category
    -- supersedes it. A genuine lifestyle tag is re-applied by 0008's own rule.
    (select array(select k from unnest(c.categories) k where k <> 'lifestyle'))
    || w.cats
  ) x)
)
from winners w
where w.clip_id = c.clip_id;

-- The invariant every browse page depends on.
update clips set categories = array['lifestyle']::text[]
where categories = '{}'::text[] or categories is null;
