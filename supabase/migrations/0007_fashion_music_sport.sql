-- ============================================================================
-- Three new categories: Fashion & Luxury, Music & Dance, Sport.
--
-- After the travel/lifestyle tightening (0006), 127 films sat in Lifestyle
-- purely because they matched no other rule — and they were not lifestyle
-- films at all: couture and watch commercials, K-pop dance challenges, World
-- Cup tributes, art and craft pieces. This gives them a real home.
--
-- Rules match over the clip's title + summary and its shot descriptions /
-- settings (all client-safe text), so a film surfaces on what it is actually
-- about. The Lifestyle rule is then re-run so films with a real home are no
-- longer dumped there, and the fallback still guarantees every clip carries
-- at least one category.
--
-- Result: fashion 151, music 85, sport 68; lifestyle catch-all 127 -> 78.
-- Idempotent — the three keys are stripped and recomputed on every run.
-- ============================================================================

with r as (
  select c.clip_id,
    (coalesce(c.title,'') || ' ' || coalesce(c.summary,'')) as txt,
    (select string_agg(coalesce(s.description,'') || ' ' || coalesce(s.setting,''), ' ')
       from shots s where s.clip_id = c.clip_id) as shot_txt
  from clips c
), flags as (
  select clip_id,
    (txt||' '||coalesce(shot_txt,'')) ~* '\m(fashion|couture|runway|catwalk|model|outfit|wardrobe|dress|gown|heel|handbag|jewel(l?ery)?|necklace|watch(es)?|timepiece|perfume|fragrance|cosmetic|make ?up|lipstick|skincare|boutique|atelier|tailor|silk|leather goods|luxury (brand|good|item)|editorial shoot|photoshoot)\M' as is_fashion,
    (txt||' '||coalesce(shot_txt,'')) ~* '\m(music|musical|song|sing(s|ing|er)?|band|orchestra|concert|guitar|piano|drum(s|mer|ming)?|violin|oud|tabla|saxophone|cello|dj|turntable|beat drop|dance|dancer|dancing|choreograph(y|ed)|ballet|k-?pop|rap(per|ping)?|hip.?hop|melody|stage performance)\M' as is_music,
    (txt||' '||coalesce(shot_txt,'')) ~* '\m(football|soccer|basketball|tennis|cricket|baseball|rugby|boxing|boxer|martial arts|karate|judo|taekwondo|mma|marathon|sprinter|athlete|athletic|gym|workout|training session|surf(ing|er)?|ski(ing|er)?|snowboard|skate(board(ing)?|r)?|cycling|cyclist|climb(ing|er)|world cup|stadium|tournament|championship|goalkeeper|penalty)\M' as is_sport
  from r
)
update clips c set categories = (
  select array(select distinct x from unnest(
    array_remove(array_remove(array_remove(c.categories,'fashion'::text),'music'::text),'sport'::text)
    || case when f.is_fashion then array['fashion']::text[] else '{}'::text[] end
    || case when f.is_music   then array['music']::text[]   else '{}'::text[] end
    || case when f.is_sport   then array['sport']::text[]   else '{}'::text[] end
  ) x)
) from flags f where f.clip_id = c.clip_id;

-- re-run the Lifestyle rule: genuine everyday films with no hospitality home
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
