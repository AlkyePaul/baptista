-- Fix 9 unit foods whose per-100g nutrition values were mistakenly treated as
-- per-unit values in 20261013_unit_foods_pasti_schedules.sql.
-- The formula `value / portion_weight * 100` inflated eggs (portion < 100g)
-- and deflated banana, pear, peach, yogurt, mozzarella (portion > 100g).
-- The correct kcal_100g IS the source value itself.
-- 2026-10-13

-- Eggs: all sizes share the same per-100g composition (USDA/CREA whole raw egg).
update baptista.foods set
  kcal_100g    = 143.0,
  protein_100g = 12.6,
  carbs_100g   = 0.7,
  fat_100g     = 9.9
where name in (
  'Uovo piccolo S (Europa)',
  'Uovo medio M (Europa)',
  'Uovo grande L (Europa)',
  'Uovo grandissimo XL (Europa)'
) and nutrition_source = 'manual';

-- Banana media (118 g edible)
update baptista.foods set
  kcal_100g    = 89.0,
  protein_100g = 1.1,
  carbs_100g   = 23.0,
  fat_100g     = 0.3
where name = 'Banana media'
  and nutrition_source = 'manual';

-- Pera media (148 g edible)
update baptista.foods set
  kcal_100g    = 57.0,
  protein_100g = 0.4,
  carbs_100g   = 15.0,
  fat_100g     = 0.1
where name = 'Pera media'
  and nutrition_source = 'manual';

-- Pesca media (130 g edible)
update baptista.foods set
  kcal_100g    = 39.0,
  protein_100g = 0.9,
  carbs_100g   = 10.0,
  fat_100g     = 0.3
where name = 'Pesca media'
  and nutrition_source = 'manual';

-- Yogurt vasetto (125 g)
update baptista.foods set
  kcal_100g    = 63.0,
  protein_100g = 3.5,
  carbs_100g   = 5.0,
  fat_100g     = 3.3
where name = 'Yogurt vasetto (125 g)'
  and nutrition_source = 'manual';

-- Mozzarella pallina (125 g)
update baptista.foods set
  kcal_100g    = 280.0,
  protein_100g = 22.0,
  carbs_100g   = 1.0,
  fat_100g     = 20.0
where name = 'Mozzarella pallina (125 g)'
  and nutrition_source = 'manual';
