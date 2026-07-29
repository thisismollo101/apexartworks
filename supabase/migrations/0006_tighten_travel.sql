-- ============================================================================
-- Tighten Travel & Places (owner decision, Aidan): the category had grown to
-- 345 films — too broad to browse. Two changes:
--
--   1. FOOD/DRINK FILMS LEAVE TRAVEL. A film that is Food or Beverage is not
--      a travel film, even when it is shot in a named city. Those films are
--      still fully reachable under Food / Beverage (multi-membership), so
--      nothing leaves the library.
--   2. THE PLACE RULE IS NARROWED to real destinations, landmarks and nature.
--      Generic scene-dressing that matched almost anything shot outdoors —
--      city, street, alley, rooftop, downtown, plaza, square, park, garden,
--      station, train, airport — no longer qualifies on its own. Named
--      destinations were extended (Cairo, Shanghai, Guangzhou, Wuhan, Seoul,
--      Bangkok, Istanbul, Marrakech, Santorini, Bali, Maldives).
--
-- Result: travel 345 -> 183. The lifestyle fallback still guarantees every
-- clip carries at least one category (27 clips whose ONLY category was the
-- old loose travel land in lifestyle).
--
-- Supersedes the `travel` branch of 0004/0005; every other category rule is
-- unchanged. Idempotent — safe to re-run after any future bulk load.
-- ============================================================================

with tightened as (
  select c.clip_id,
    (exists (
       select 1 from shots s
       where s.clip_id = c.clip_id
         and s.setting ~* '\m(temple|shrine|tower|bridge|harbou?r|beach|coast|mountain|forest|desert|canyon|village|waterfall|lake|river|ocean|cliff|glacier|island|countryside|landmark|castle|palace|skyline|tokyo|kyoto|osaka|paris|london|new york|rome|venice|dubai|asakusa|cairo|shanghai|guangzhou|wuhan|seoul|bangkok|istanbul|marrakech|santorini|bali|maldives)\M')
     and not ('food' = any(c.categories) or 'beverage' = any(c.categories))) as qualifies
  from clips c
)
update clips c
set categories = case
  when t.qualifies and not ('travel' = any(c.categories)) then array_append(c.categories, 'travel'::text)
  when not t.qualifies then array_remove(c.categories, 'travel'::text)
  else c.categories end
from tightened t
where t.clip_id = c.clip_id;

-- no clip is ever orphaned from browse
update clips set categories = array['lifestyle']::text[]
where categories = '{}'::text[] or categories is null;
