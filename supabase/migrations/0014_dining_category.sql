-- ============================================================================
-- DINING — the meal being eaten, not the dish being photographed.
--
-- Requested by Aidan, with the explicit widening: "anyone eating should be
-- featured in there also". So this is not a formal-restaurant tab. It is any
-- film where a meal is happening — someone sitting down to eat, a shared
-- table, or simply a person taking a bite.
--
-- It deliberately overlaps `food` and `venue` and does not compete with them:
--   food   = an edible item is the HERO of a shot (tag-derived, 0005)
--   venue  = a hospitality PLACE appears (0008)
--   dining = a person is EATING, or the film is about a meal
-- A ramen close-up with nobody eating is food, not dining. A family sharing a
-- table is dining even when no single dish is the hero.
--
-- WHY THE RULE IS LOOSER THAN 0011/0013's two-term standard. Those categories
-- have broad vocabularies where one word proves nothing — a single "street"
-- does not make a travel film. Dining's vocabulary is narrow and unambiguous:
-- "banquet", "sommelier", "fine dining", "biting" mean what they say on one
-- appearance. Measured before choosing: the two-term rule caught only 28 films
-- and missed obvious ones; this rule catches 176.
--
-- Three independent signals, any one of which is enough:
--   1. an unambiguous dining word,
--   2. an eating verb anywhere in the clip's text,
--   3. a shot the splitter already tagged with an eating action.
--
-- Idempotent — recomputed from text and tags on every run.
-- ============================================================================

with dining as (
  select c.clip_id
  from clips c
  where
    -- 1. unambiguous on a single appearance
    coalesce(c.search_text,'') ~* '\m(dining|dinner|banquet|fine dining|tasting menu|dinner party|sommelier|waiter|waitress|brunch|supper|feast|feasting)\M'
    -- 2. somebody is eating
    or coalesce(c.search_text,'') ~* '\m(eating|eats|ate|eaten|bite|bites|biting|chewing|chews|mouthful|devour|devours|slurp|slurps|slurping|tasting|tastes|savour|savours|savouring|savor|savors|savoring|munch|munches|nibble|nibbles)\M'
    -- 3. the shot splitter already saw an eating action
    or exists (
      select 1 from shots s
      where s.clip_id = c.clip_id
        and s.action ~* '\m(biting|eating|chewing|tasting|slurping|feasting)\M'
    )
)
update clips c
set categories = (
  select array(select distinct x from unnest(
    -- 'lifestyle' alone only ever meant "nothing caught this"
    (select array(select k from unnest(c.categories) k where k <> 'lifestyle'))
    || array['dining']::text[]
  ) x)
)
from dining d
where d.clip_id = c.clip_id;

update clips set categories = array['lifestyle']::text[]
where categories = '{}'::text[] or categories is null;
