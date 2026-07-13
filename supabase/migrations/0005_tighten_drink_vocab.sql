-- ============================================================================
-- Tighten the Food category: widen the drink vocabulary + garnish guard.
--
-- 0004's drink list missed named drinks like "purple slushy" and "iced kopi
-- susu", and a bare garnish item ("cinnamon" on an espresso drink) could put
-- a beverage film into Food. This re-derivation:
--   * widens the drink vocab (slushy, kopi, frappe, chai, macchiato, lassi,
--     kombucha, cider, ale, spirits, soft-drink brands, …) in BOTH the food
--     exclusion and the beverage inclusion;
--   * excludes items that are nothing but a garnish/ingredient token
--     (exact-match, so "ice cream" and "cinnamon roll" still count as food);
--   * recomputes every clip's categories (idempotent, same shape as 0004).
--
-- Only the food/beverage rules change; venue/event/travel/characters/action/
-- lifestyle rules are identical to 0004. Fallback still guarantees ≥1
-- category per clip. View/grants untouched.
-- ============================================================================

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
        and s.food_item !~* '\m(coffee|latte|espresso|cappuccino|mocha|matcha|tea|boba|soda|cola|juice|smoothie|milkshake|cocktail|wine|beer|sake|champagne|lemonade|milk|cocoa|drink|beverage|brew|slush(y|ie|ies)?|kopi|susu|frapp(e|uccino)|chai|americano|macchiato|oolong|lassi|kombucha|horchata|cider|ale|stout|whisk(y|ey)|vodka|rum|tequila|spritz|negroni|margarita|mojito|sangria|prosecco|mocktail|seltzer|mirinda|pepsi|sprite|fanta|calpis|yakult)\M'
        -- a bare garnish/ingredient token is not a food subject (exact match
        -- only — "ice cream" / "cinnamon roll" still qualify as food)
        and s.food_item !~* '^\s*(cinnamon|sugar|brown sugar|ice|ice cubes?|foam|milk foam|oat milk foam|syrup|whipped cream|cream|garnish|mint)\s*$'
    )

    union all
    -- BEVERAGE: a drink item appears in some shot, or a barista is the subject
    select 'beverage'
    where exists (
      select 1 from shots s
      where s.clip_id = c.clip_id
        and (
          s.food_item ~* '\m(coffee|latte|espresso|cappuccino|mocha|matcha|tea|boba|soda|cola|juice|smoothie|milkshake|cocktail|wine|beer|sake|champagne|lemonade|cocoa|drink|beverage|brew|slush(y|ie|ies)?|kopi|susu|frapp(e|uccino)|chai|americano|macchiato|oolong|lassi|kombucha|horchata|cider|ale|stout|whisk(y|ey)|vodka|rum|tequila|spritz|negroni|margarita|mojito|sangria|prosecco|mocktail|seltzer|mirinda|pepsi|sprite|fanta|calpis|yakult)\M'
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
