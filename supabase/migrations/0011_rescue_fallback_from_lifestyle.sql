-- ============================================================================
-- Lifestyle had become the junk drawer.
--
-- 0008 ends by giving any clip that matched no rule the single category
-- 'lifestyle', so that nothing is orphaned from browse. That was survivable at
-- 766 films. At 1,596 it was not: 475 clips carried 'lifestyle' and 418 of
-- them had it as their ONLY category — they were not lifestyle films, they
-- were the ones nothing else caught. The tab stopped meaning anything.
--
-- WHY SO MANY FELL THROUGH. Every rule in 0004/0005/0008 reads the title, the
-- summary, and a handful of shot tag columns. It never reads the richest text
-- we hold — clips.verbatim_prompt. The films loaded from the main library have
-- derived titles and summaries, which are plainer and shorter than the
-- model-written ones, so far fewer of them trip a title/summary keyword.
--
-- THE RULE HERE keeps 0008's standard rather than lowering it: a category is
-- assigned on prompt text only when at least TWO DISTINCT terms from that
-- category's vocabulary appear. One passing mention of a street in a 1,400
-- character prompt is not a travel film, which is the precise false positive
-- 0008 was written to remove. Only if nothing reaches two does a clip take the
-- single best category with one match, and only if there is no match at all
-- does it stay in lifestyle.
--
-- SCOPE. Touches ONLY clips whose categories are exactly {lifestyle} AND that
-- do not satisfy 0008's genuine everyday test (a guest/family subject in a
-- calm or playful shot). A real lifestyle film keeps its tab.
--
-- Idempotent: re-running re-evaluates the same way and is a no-op once a clip
-- has moved off the bare fallback.
-- ============================================================================

with cand as (
  select c.clip_id,
         coalesce(c.verbatim_prompt,'') || ' ' || coalesce(c.title,'') || ' ' || coalesce(c.summary,'') as txt
  from clips c
  where c.categories = array['lifestyle']::text[]
    and not exists (
      select 1 from shots s
      where s.clip_id = c.clip_id
        and s.subject_role in ('guest','family')
        and s.mood in ('calm','playful')
    )
),
scores as (
  select clip_id, 'travel' as cat,
         (select count(distinct lower(m[1])) from regexp_matches(txt,
           '\m(temple|shrine|tower|bridge|harbour|harbor|beach|coast|mountain|forest|desert|canyon|village|waterfall|lake|river|ocean|cliff|glacier|island|countryside|landmark|castle|palace|skyline|tokyo|kyoto|osaka|paris|london|new york|rome|venice|dubai|cairo|shanghai|seoul|bangkok|istanbul|marrakech|santorini|bali|maldives|highlands)\M','gi') m) as n
  from cand
  union all
  select clip_id, 'action',
         (select count(distinct lower(m[1])) from regexp_matches(txt,
           '\m(chase|race|racing|sprint|parkour|drift|heist|escape|stunt|pursuit|explosion|fight|battle|combat|chasing|rooftop leap|freefall)\M','gi') m)
  from cand
  union all
  select clip_id, 'fashion',
         (select count(distinct lower(m[1])) from regexp_matches(txt,
           '\m(fashion|couture|runway|catwalk|handbag|jewellery|jewelry|necklace|timepiece|wristwatch|perfume|fragrance|cosmetics|lipstick|skincare|boutique|atelier|gown|stiletto|high heels|outfit|wardrobe|styling|glamour|glamor)\M','gi') m)
  from cand
  union all
  select clip_id, 'music',
         (select count(distinct lower(m[1])) from regexp_matches(txt,
           '\m(music|song|singer|singing|band|orchestra|concert|guitar|piano|drummer|drumming|violin|saxophone|cello|dj|turntable|choreography|ballet|k-pop|rapper|rapping|dance|dancer|dancing)\M','gi') m)
  from cand
  union all
  select clip_id, 'sport',
         (select count(distinct lower(m[1])) from regexp_matches(txt,
           '\m(football|soccer|basketball|tennis|cricket|baseball|rugby|boxing|boxer|martial arts|karate|judo|marathon|sprinter|world cup|stadium|tournament|championship|surfing|surfer|skiing|snowboard|skateboard|skater|cycling|cyclist|gym|workout|fitness|weightlifting|diving|olympic|swimming|swimmer|athlete)\M','gi') m)
  from cand
  union all
  select clip_id, 'art',
         (select count(distinct lower(m[1])) from regexp_matches(txt,
           '\m(mural|painting|painter|sculpture|sculptor|calligraphy|manga|anime|comic|museum|gallery|artwork|artisan|pottery|ceramic|origami|puppet|illustration|canvas|brushstroke|craftsman|embroidery)\M','gi') m)
  from cand
  union all
  select clip_id, 'event',
         (select count(distinct lower(m[1])) from regexp_matches(txt,
           '\m(festival|concert|wedding|party|celebration|parade|firework|fireworks|new year|ceremony|carnival|gala|rave)\M','gi') m)
  from cand
  union all
  select clip_id, 'venue',
         (select count(distinct lower(m[1])) from regexp_matches(txt,
           '\m(restaurant|cafe|bistro|diner|bakery|patisserie|hotel|izakaya|ramen|noodle shop|sushi|pizzeria|steakhouse|brasserie|eatery|pub|tavern|cocktail bar|wine bar|buffet|brewery|winery|teahouse|night market|street food|hotpot|dining room)\M','gi') m)
  from cand
  union all
  select clip_id, 'characters',
         (select count(distinct lower(m[1])) from regexp_matches(txt,
           '\m(cat|dog|penguin|raccoon|panda|fox|bear|rabbit|mascot|creature|dragon|robot)\M','gi') m)
  from cand
),
picked as (
  select clip_id,
    coalesce(
      -- two distinct terms or better: every category that clears the bar
      array_agg(cat order by cat) filter (where n >= 2),
      -- nothing convincing: the single strongest one-term signal
      (array_agg(cat order by n desc, cat) filter (where n >= 1))[1:1]
    ) as cats
  from scores
  group by clip_id
)
update clips c
set categories = coalesce(p.cats, array['lifestyle']::text[])
from picked p
where p.clip_id = c.clip_id
  and p.cats is not null;

-- Belt and braces: the invariant every browse page depends on.
update clips set categories = array['lifestyle']::text[]
where categories = '{}'::text[] or categories is null;
