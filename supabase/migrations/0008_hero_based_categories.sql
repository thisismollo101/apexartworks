-- ============================================================================
-- Category accuracy overhaul: "is this what the film is ABOUT?"
--
-- Audit (Aidan) found categories were capturing incidental mentions rather
-- than the subject of the film:
--   * Fashion matched "watches the sunset", "dressed", "model" — a cargo-plane
--     thriller and a travel-day montage were tagged Fashion (151 films, ~2/3
--     false positives).
--   * Venue matched any shot whose setting mentioned a kitchen or a market —
--     so HOME kitchens ("Her First Cake", "Home Is My Happy Place") and street
--     markets counted as hospitality venues (214 films, ~100 false).
--   * Music matched a single incidental lion-dance beat inside a city portrait.
--   * Sport missed diving/olympic/swimming entirely.
--
-- THE RULE, applied uniformly: a category is assigned only when the signal is
-- in the clip's TITLE + SUMMARY (what the film is about) or appears in AT
-- LEAST TWO shots (a sustained element) — never on one passing mention.
-- Venue additionally requires a real hospitality venue: a bare "kitchen"
-- only counts as a professional/restaurant kitchen WITH chef/barista staff.
--
-- Also adds ART & CRAFT for a real cluster that had no home (murals, manga,
-- sculpture, calligraphy, museums, artisan craft) and extends Sport with
-- diving/olympic/swimming/champion.
--
-- Food and Beverage are untouched: they are tag-derived from food_role
-- hero/featured, which is already a subject-level test.
--
-- Result: food 209, travel 175, lifestyle 174, action 137, beverage 121,
-- venue 115, characters 76, sport 57, music 56, fashion 49, art 37, event 34.
-- 766 films, 0 uncategorized, 1.67 categories per film on average.
-- Idempotent — every derived key is stripped and recomputed on each run.
-- ============================================================================

with h as (
  select clip_id, coalesce(title,'') || ' ' || coalesce(summary,'') as head from clips
), sh as (
  select s.clip_id,
    count(*) filter (where coalesce(s.description,'')||' '||coalesce(s.setting,'') ~* '\m(restaurant|caf(e|é)|bistro|diner|bakery|patisserie|hotel|izakaya|ramen (shop|bar)|noodle (shop|bar)|sushi (bar|counter|restaurant)|pizzeria|steakhouse|deli|taqueria|brasserie|eatery|pub|tavern|banquet hall|dining (room|hall)|cocktail bar|wine bar|rooftop bar|buffet|brewery|winery|tearoom|tea ?house|cafeteria|canteen|food (stall|truck|court)|night market|street food|hotpot)\M') as venue_hits,
    count(*) filter (where coalesce(s.setting,'') ~* '\m(restaurant|commercial|professional|open) kitchen\M') as prokitchen_hits,
    count(*) filter (where s.subject_role in ('chef','barista')) as staff_hits,
    count(*) filter (where coalesce(s.description,'')||' '||coalesce(s.setting,'') ~* '\m(festival|concert|wedding|party|celebration|parade|firework|new year|ceremony|carnival|gala|rave|dance floor)\M') as event_hits,
    count(*) filter (where coalesce(s.setting,'') ~* '\m(temple|shrine|tower|bridge|harbou?r|beach|coast|mountain|forest|desert|canyon|village|waterfall|lake|river|ocean|cliff|glacier|island|countryside|landmark|castle|palace|skyline|tokyo|kyoto|osaka|paris|london|new york|rome|venice|dubai|asakusa|cairo|shanghai|guangzhou|wuhan|seoul|bangkok|istanbul|marrakech|santorini|bali|maldives|highlands?)\M') as travel_hits,
    count(*) filter (where coalesce(s.description,'')||' '||coalesce(s.setting,'') ~* '\m(fashion|couture|runway|catwalk|handbag|jewel(l?ery)?|necklace|timepiece|wristwatch|perfume|fragrance|cosmetics?|lipstick|skincare|boutique|atelier|gown|stiletto|high heels|outfit|wardrobe)\M') as fashion_hits,
    count(*) filter (where coalesce(s.description,'')||' '||coalesce(s.setting,'') ~* '\m(music|song|sing(s|ing|er)|band|orchestra|concert|guitar|piano|drummer|drumming|violin|oud|tabla|saxophone|cello|dj|turntable|choreograph(y|ed)|ballet|k-?pop|rap(per|ping)|dance|dancer|dancing)\M') as music_hits,
    count(*) filter (where coalesce(s.description,'')||' '||coalesce(s.setting,'') ~* '\m(football|soccer|basketball|tennis|cricket|baseball|rugby|boxing|boxer|martial arts|karate|judo|taekwondo|mma|marathon|sprinter|world cup|stadium|tournament|championship|goalkeeper|surf(ing|er)|ski(ing|er)|snowboard(ing|er)?|skateboard(ing|er)?|skater|cycling|cyclist|gym|workout|fitness|weightlifting|bodybuilding|div(er|ing)|olympic|swimm(er|ing))\M') as sport_hits,
    count(*) filter (where coalesce(s.description,'')||' '||coalesce(s.setting,'') ~* '\m(mural|painting|painter|sculpture|sculptor|calligraphy|manga|anime|comic|museum|gallery|artwork|artisan|pottery|ceramic|origami|puppet|illustration|canvas|brushstroke|craftsman|embroider)\M') as art_hits,
    count(*) filter (where s.subject_role = 'animal-character') as animal_hits
  from shots s group by s.clip_id
)
update clips c set categories = (
  select array(select distinct x from unnest(
    -- food / beverage are tag-derived (hero/featured food_role) — preserved
    (select array(select k from unnest(c.categories) k where k in ('food','beverage')))
    || case when h.head ~* '\m(restaurant|caf(e|é)|bistro|diner|bakery|patisserie|hotel|izakaya|ramen|noodle shop|sushi|pizzeria|steakhouse|brasserie|eatery|pub|tavern|cocktail bar|wine bar|rooftop bar|buffet|brewery|winery|tea ?house|food stall|food truck|night market|street food|hotpot|dining room)\M'
                  or coalesce(sh.venue_hits,0) >= 2
                  or (coalesce(sh.prokitchen_hits,0) >= 1 and coalesce(sh.staff_hits,0) >= 1)
               then array['venue']::text[] else '{}'::text[] end
    || case when h.head ~* '\m(festival|concert|wedding|party|celebration|parade|firework|new year|ceremony|carnival|gala)\M' or coalesce(sh.event_hits,0) >= 2 then array['event']::text[] else '{}'::text[] end
    || case when (h.head ~* '\m(temple|shrine|tower|bridge|harbou?r|beach|coast|mountain|forest|desert|canyon|village|waterfall|lake|river|ocean|cliff|glacier|island|countryside|landmark|castle|palace|skyline|tokyo|kyoto|osaka|paris|london|new york|rome|venice|dubai|cairo|shanghai|guangzhou|wuhan|seoul|bangkok|istanbul|marrakech|santorini|bali|maldives|highlands?|maya)\M' or coalesce(sh.travel_hits,0) >= 2)
                  and not ('food' = any(c.categories) or 'beverage' = any(c.categories))
               then array['travel']::text[] else '{}'::text[] end
    || case when h.head ~* '\m(fashion|couture|runway|catwalk|handbag|jewel(l?ery)?|necklace|timepiece|wristwatch|perfume|fragrance|cosmetics?|skincare|boutique|atelier|gown|outfit|wardrobe|styling|glamou?r|photoshoot|luxe)\M' or coalesce(sh.fashion_hits,0) >= 2 then array['fashion']::text[] else '{}'::text[] end
    || case when h.head ~* '\m(music|song|sing(s|ing|er)|band|orchestra|concert|guitar|piano|drummer|violin|oud|tabla|dj|choreograph(y|ed)|ballet|k-?pop|rap(per|ping)|dance|dancer|dancing)\M' or coalesce(sh.music_hits,0) >= 2 then array['music']::text[] else '{}'::text[] end
    || case when h.head ~* '\m(football|soccer|basketball|tennis|cricket|baseball|rugby|boxing|boxer|martial arts|karate|judo|mma|marathon|sprinter|world cup|stadium|tournament|championship|surf(ing|er)|ski(ing|er)|snowboard|skateboard(ing|er)?|skater|cycling|cyclist|gym|workout|fitness|weightlifting|bodybuilding|div(er|ing)|olympic|swimm(er|ing)|athlete|champion)\M' or coalesce(sh.sport_hits,0) >= 2 then array['sport']::text[] else '{}'::text[] end
    || case when h.head ~* '\m(mural|painting|painter|sculpture|sculptor|calligraphy|manga|anime|comic|museum|gallery|artwork|artisan|pottery|ceramic|origami|puppet|illustration|canvas|craftsman|embroider|art(ist)?)\M' or coalesce(sh.art_hits,0) >= 2 then array['art']::text[] else '{}'::text[] end
    || case when coalesce(sh.animal_hits,0) >= 2 or h.head ~* '\m(cat|dog|penguin|raccoon|panda|fox|bear|rabbit|animal|creature|mascot)\M' then array['characters']::text[] else '{}'::text[] end
    || (select array(select k from unnest(c.categories) k where k = 'action'))
  ) x)
) from h left join sh on sh.clip_id = h.clip_id where h.clip_id = c.clip_id;

-- Lifestyle: genuine everyday human moments with no hospitality home
with m as (
  select c.clip_id,
    exists (select 1 from shots s where s.clip_id = c.clip_id
            and s.subject_role in ('guest','family') and s.mood in ('calm','playful')) as everyday,
    ('food' = any(c.categories) or 'beverage' = any(c.categories) or 'venue' = any(c.categories)) as has_hospitality
  from clips c
)
update clips c set categories = case
  when m.everyday and not m.has_hospitality and not ('lifestyle' = any(c.categories))
    then array_append(c.categories, 'lifestyle'::text)
  when not (m.everyday and not m.has_hospitality)
    then array_remove(c.categories, 'lifestyle'::text)
  else c.categories end
from m where m.clip_id = c.clip_id;

-- no clip is ever orphaned from browse
update clips set categories = array['lifestyle']::text[]
where categories = '{}'::text[] or categories is null;
