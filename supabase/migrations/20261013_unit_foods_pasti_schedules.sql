-- Unit foods (portion_label / portion_weight_g), meal schedules, schedule_id on diet_entries.
-- 2026-10-13

-- A1. Portion columns on foods ---------------------------------------------------

alter table baptista.foods
  add column portion_label text check (portion_label is null or char_length(portion_label) between 1 and 80),
  add column portion_weight_g numeric(7,1) check (portion_weight_g is null or portion_weight_g between 0.1 and 5000);
alter table baptista.foods
  add constraint foods_portion_check check ((portion_label is null) = (portion_weight_g is null));

-- Update GRANT INSERT/UPDATE on foods to include the new columns.
grant insert (portion_label, portion_weight_g), update (portion_label, portion_weight_g)
  on baptista.foods to authenticated;

-- Recreate ensure_food() with 2 extra parameters.
create or replace function baptista.ensure_food(
  p_household_id uuid, p_name text, p_brand text default null, p_barcode text default null,
  p_category text default null, p_storage text default null,
  p_kcal numeric default null, p_protein numeric default null, p_carbs numeric default null, p_fat numeric default null,
  p_source text default null,
  p_portion_label text default null, p_portion_weight_g numeric default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  fid uuid;
begin
  if p_barcode is not null then
    select id into fid from baptista.foods where household_id = p_household_id and barcode = p_barcode;
    if found then
      return fid;
    end if;
  end if;
  select id into fid from baptista.foods
   where household_id = p_household_id and barcode is null
     and name_key = baptista.name_key(p_name) and brand_key = baptista.name_key(coalesce(p_brand, ''))
   order by created_at limit 1;
  if found then
    return fid;
  end if;
  insert into baptista.foods (household_id, name, brand, barcode, category, default_storage,
                              kcal_100g, protein_100g, carbs_100g, fat_100g, nutrition_source,
                              portion_label, portion_weight_g)
  values (p_household_id, p_name, p_brand, p_barcode, coalesce(p_category, 'other'),
          coalesce(p_storage, case when p_category in ('produce', 'dairy', 'meat_fish', 'ready_meal') then 'fridge'
                                   when p_category = 'frozen' then 'freezer' else 'pantry' end),
          p_kcal, p_protein, p_carbs, p_fat, p_source,
          p_portion_label, p_portion_weight_g)
  on conflict do nothing
  returning id into fid;
  if fid is null then
    select id into fid from baptista.foods
     where household_id = p_household_id
       and ((p_barcode is not null and barcode = p_barcode)
            or (barcode is null and name_key = baptista.name_key(p_name) and brand_key = baptista.name_key(coalesce(p_brand, ''))))
     limit 1;
  end if;
  return fid;
end;
$$;

-- Revoke old signature, grant new one.
revoke execute on function
  baptista.ensure_food(uuid, text, text, text, text, text, numeric, numeric, numeric, numeric, text)
from public, anon, authenticated;
grant execute on function
  baptista.ensure_food(uuid, text, text, text, text, text, numeric, numeric, numeric, numeric, text, text, numeric)
to authenticated;

-- A2. Import CSV: 32 unit foods ---------------------------------------------------
-- Each row is inserted via ensure_food so it is idempotent.
-- kcal_100g = round(kcal_per_unit / edible_weight_g * 100, 2)
-- name = portion_name, portion_label = portion_name, portion_weight_g = edible_weight_g

-- We use a DO block per household. Since these are catalog items, they are inserted for every
-- household. But unit foods should be available to all households automatically, so we insert
-- them for each active household.

do $$
declare
  hid uuid;
begin
  for hid in select id from baptista.households loop
    -- Eggs
    perform baptista.ensure_food(hid, 'Uovo piccolo S (Europa)', null, null, 'dairy', 'fridge',
      round(143.0 / 48.0 * 100, 2), round(12.6 / 48.0 * 100, 2), round(0.7 / 48.0 * 100, 2), round(9.9 / 48.0 * 100, 2),
      'manual', 'Uovo piccolo S (Europa)', 48.0);
    perform baptista.ensure_food(hid, 'Uovo medio M (Europa)', null, null, 'dairy', 'fridge',
      round(143.0 / 53.0 * 100, 2), round(12.6 / 53.0 * 100, 2), round(0.7 / 53.0 * 100, 2), round(9.9 / 53.0 * 100, 2),
      'manual', 'Uovo medio M (Europa)', 53.0);
    perform baptista.ensure_food(hid, 'Uovo grande L (Europa)', null, null, 'dairy', 'fridge',
      round(143.0 / 58.0 * 100, 2), round(12.6 / 58.0 * 100, 2), round(0.7 / 58.0 * 100, 2), round(9.9 / 58.0 * 100, 2),
      'manual', 'Uovo grande L (Europa)', 58.0);
    perform baptista.ensure_food(hid, 'Uovo grandissimo XL (Europa)', null, null, 'dairy', 'fridge',
      round(143.0 / 66.0 * 100, 2), round(12.6 / 66.0 * 100, 2), round(0.7 / 66.0 * 100, 2), round(9.9 / 66.0 * 100, 2),
      'manual', 'Uovo grandissimo XL (Europa)', 66.0);
    -- Egg whites / yolks
    perform baptista.ensure_food(hid, 'Albume medio (Europa)', null, null, 'dairy', 'fridge',
      round(52.0 * 33.0 / 100.0 / 33.0 * 100, 2), round(11.0 * 33.0 / 100.0 / 33.0 * 100, 2), round(0.7 * 33.0 / 100.0 / 33.0 * 100, 2), round(0.2 * 33.0 / 100.0 / 33.0 * 100, 2),
      'manual', 'Albume medio (Europa)', 33.0);
    perform baptista.ensure_food(hid, 'Tuorlo medio (Europa)', null, null, 'dairy', 'fridge',
      round(322.0 * 17.0 / 100.0 / 17.0 * 100, 2), round(16.0 * 17.0 / 100.0 / 17.0 * 100, 2), round(3.6 * 17.0 / 100.0 / 17.0 * 100, 2), round(27.0 * 17.0 / 100.0 / 17.0 * 100, 2),
      'manual', 'Tuorlo medio (Europa)', 17.0);
    -- Bread slices
    perform baptista.ensure_food(hid, 'Fetta di pane in cassetta', null, null, 'bakery', 'pantry',
      round(74.0 / 28.0 * 100, 2), round(2.6 / 28.0 * 100, 2), round(13.0 / 28.0 * 100, 2), round(1.0 / 28.0 * 100, 2),
      'manual', 'Fetta di pane in cassetta', 28.0);
    perform baptista.ensure_food(hid, 'Fetta di pane integrale in cassetta', null, null, 'bakery', 'pantry',
      round(69.0 / 28.0 * 100, 2), round(3.0 / 28.0 * 100, 2), round(11.0 / 28.0 * 100, 2), round(1.2 / 28.0 * 100, 2),
      'manual', 'Fetta di pane integrale in cassetta', 28.0);
    perform baptista.ensure_food(hid, 'Fetta biscottata classica', null, null, 'bakery', 'pantry',
      round(41.0 / 10.0 * 100, 2), round(1.2 / 10.0 * 100, 2), round(7.0 / 10.0 * 100, 2), round(0.9 / 10.0 * 100, 2),
      'manual', 'Fetta biscottata classica', 10.0);
    perform baptista.ensure_food(hid, 'Fetta biscottata integrale', null, null, 'bakery', 'pantry',
      round(38.0 / 10.0 * 100, 2), round(1.3 / 10.0 * 100, 2), round(6.0 / 10.0 * 100, 2), round(0.9 / 10.0 * 100, 2),
      'manual', 'Fetta biscottata integrale', 10.0);
    -- Fruits
    perform baptista.ensure_food(hid, 'Banana media', null, null, 'produce', 'pantry',
      round(89.0 / 118.0 * 100, 2), round(1.1 / 118.0 * 100, 2), round(23.0 / 118.0 * 100, 2), round(0.3 / 118.0 * 100, 2),
      'manual', 'Banana media', 118.0);
    perform baptista.ensure_food(hid, 'Mela media', null, null, 'produce', 'fridge',
      round(72.0 / 140.0 * 100, 2), round(0.4 / 140.0 * 100, 2), round(19.0 / 140.0 * 100, 2), round(0.2 / 140.0 * 100, 2),
      'manual', 'Mela media', 140.0);
    perform baptista.ensure_food(hid, 'Arancia media', null, null, 'produce', 'fridge',
      round(62.0 / 131.0 * 100, 2), round(1.2 / 131.0 * 100, 2), round(15.0 / 131.0 * 100, 2), round(0.2 / 131.0 * 100, 2),
      'manual', 'Arancia media', 131.0);
    perform baptista.ensure_food(hid, 'Kiwi medio', null, null, 'produce', 'fridge',
      round(42.0 / 69.0 * 100, 2), round(0.8 / 69.0 * 100, 2), round(10.0 / 69.0 * 100, 2), round(0.4 / 69.0 * 100, 2),
      'manual', 'Kiwi medio', 69.0);
    perform baptista.ensure_food(hid, 'Mandarino medio', null, null, 'produce', 'fridge',
      round(40.0 / 76.0 * 100, 2), round(0.6 / 76.0 * 100, 2), round(10.0 / 76.0 * 100, 2), round(0.2 / 76.0 * 100, 2),
      'manual', 'Mandarino medio', 76.0);
    perform baptista.ensure_food(hid, 'Pera media', null, null, 'produce', 'fridge',
      round(57.0 / 148.0 * 100, 2), round(0.4 / 148.0 * 100, 2), round(15.0 / 148.0 * 100, 2), round(0.1 / 148.0 * 100, 2),
      'manual', 'Pera media', 148.0);
    perform baptista.ensure_food(hid, 'Pesca media', null, null, 'produce', 'fridge',
      round(39.0 / 130.0 * 100, 2), round(0.9 / 130.0 * 100, 2), round(10.0 / 130.0 * 100, 2), round(0.3 / 130.0 * 100, 2),
      'manual', 'Pesca media', 130.0);
    -- Dairy
    perform baptista.ensure_food(hid, 'Yogurt vasetto (125 g)', null, null, 'dairy', 'fridge',
      round(63.0 / 125.0 * 100, 2), round(3.5 / 125.0 * 100, 2), round(5.0 / 125.0 * 100, 2), round(3.3 / 125.0 * 100, 2),
      'manual', 'Yogurt vasetto (125 g)', 125.0);
    perform baptista.ensure_food(hid, 'Yogurt greco vasetto (170 g)', null, null, 'dairy', 'fridge',
      round(100.0 / 170.0 * 100, 2), round(17.0 / 170.0 * 100, 2), round(6.0 / 170.0 * 100, 2), round(0.7 / 170.0 * 100, 2),
      'manual', 'Yogurt greco vasetto (170 g)', 170.0);
    perform baptista.ensure_food(hid, 'Mozzarella pallina (125 g)', null, null, 'dairy', 'fridge',
      round(280.0 / 125.0 * 100, 2), round(22.0 / 125.0 * 100, 2), round(1.0 / 125.0 * 100, 2), round(20.0 / 125.0 * 100, 2),
      'manual', 'Mozzarella pallina (125 g)', 125.0);
    perform baptista.ensure_food(hid, 'Sottiletta (fetta, 20 g)', null, null, 'dairy', 'fridge',
      round(61.0 / 20.0 * 100, 2), round(3.0 / 20.0 * 100, 2), round(1.0 / 20.0 * 100, 2), round(5.0 / 20.0 * 100, 2),
      'manual', 'Sottiletta (fetta, 20 g)', 20.0);
    -- Deli / cold cuts
    perform baptista.ensure_food(hid, 'Fetta di prosciutto crudo', null, null, 'meat_fish', 'fridge',
      round(35.0 / 15.0 * 100, 2), round(4.0 / 15.0 * 100, 2), round(0.0 / 15.0 * 100, 2), round(2.0 / 15.0 * 100, 2),
      'manual', 'Fetta di prosciutto crudo', 15.0);
    perform baptista.ensure_food(hid, 'Fetta di prosciutto cotto', null, null, 'meat_fish', 'fridge',
      round(22.0 / 15.0 * 100, 2), round(3.0 / 15.0 * 100, 2), round(0.2 / 15.0 * 100, 2), round(1.0 / 15.0 * 100, 2),
      'manual', 'Fetta di prosciutto cotto', 15.0);
    perform baptista.ensure_food(hid, 'Fetta di salame', null, null, 'meat_fish', 'fridge',
      round(53.0 / 15.0 * 100, 2), round(3.5 / 15.0 * 100, 2), round(0.3 / 15.0 * 100, 2), round(4.0 / 15.0 * 100, 2),
      'manual', 'Fetta di salame', 15.0);
    perform baptista.ensure_food(hid, 'Fetta di bresaola', null, null, 'meat_fish', 'fridge',
      round(23.0 / 15.0 * 100, 2), round(5.0 / 15.0 * 100, 2), round(0.0 / 15.0 * 100, 2), round(0.3 / 15.0 * 100, 2),
      'manual', 'Fetta di bresaola', 15.0);
    -- Sweets / biscuits
    perform baptista.ensure_food(hid, 'Biscotto frollino classico', null, null, 'bakery', 'pantry',
      round(45.0 / 10.0 * 100, 2), round(0.7 / 10.0 * 100, 2), round(6.0 / 10.0 * 100, 2), round(1.8 / 10.0 * 100, 2),
      'manual', 'Biscotto frollino classico', 10.0);
    perform baptista.ensure_food(hid, 'Biscotto integrale', null, null, 'bakery', 'pantry',
      round(42.0 / 10.0 * 100, 2), round(0.8 / 10.0 * 100, 2), round(5.5 / 10.0 * 100, 2), round(1.7 / 10.0 * 100, 2),
      'manual', 'Biscotto integrale', 10.0);
    -- Beverages
    perform baptista.ensure_food(hid, 'Tazza di latte intero (200 ml)', null, null, 'dairy', 'fridge',
      round(128.0 / 200.0 * 100, 2), round(6.4 / 200.0 * 100, 2), round(10.0 / 200.0 * 100, 2), round(7.2 / 200.0 * 100, 2),
      'manual', 'Tazza di latte intero (200 ml)', 200.0);
    perform baptista.ensure_food(hid, 'Tazza di latte parzialmente scremato (200 ml)', null, null, 'dairy', 'fridge',
      round(92.0 / 200.0 * 100, 2), round(6.4 / 200.0 * 100, 2), round(10.0 / 200.0 * 100, 2), round(3.2 / 200.0 * 100, 2),
      'manual', 'Tazza di latte parzialmente scremato (200 ml)', 200.0);
    perform baptista.ensure_food(hid, 'Tazza di latte scremato (200 ml)', null, null, 'dairy', 'fridge',
      round(68.0 / 200.0 * 100, 2), round(6.8 / 200.0 * 100, 2), round(10.0 / 200.0 * 100, 2), round(0.4 / 200.0 * 100, 2),
      'manual', 'Tazza di latte scremato (200 ml)', 200.0);
    -- Nuts / snacks
    perform baptista.ensure_food(hid, 'Noce sgusciata', null, null, 'other', 'pantry',
      round(39.0 / 6.0 * 100, 2), round(0.9 / 6.0 * 100, 2), round(0.8 / 6.0 * 100, 2), round(3.9 / 6.0 * 100, 2),
      'manual', 'Noce sgusciata', 6.0);
    perform baptista.ensure_food(hid, 'Mandorla sgusciata', null, null, 'other', 'pantry',
      round(7.0 / 1.2 * 100, 2), round(0.3 / 1.2 * 100, 2), round(0.2 / 1.2 * 100, 2), round(0.6 / 1.2 * 100, 2),
      'manual', 'Mandorla sgusciata', 1.2);
    perform baptista.ensure_food(hid, 'Cucchiaio di olio extravergine', null, null, 'other', 'pantry',
      round(108.0 / 12.0 * 100, 2), round(0.0 / 12.0 * 100, 2), round(0.0 / 12.0 * 100, 2), round(12.0 / 12.0 * 100, 2),
      'manual', 'Cucchiaio di olio extravergine', 12.0);
  end loop;
end;
$$;

-- A3. Table meal_schedules -------------------------------------------------------

create table baptista.meal_schedules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'private' check (visibility = 'private'),
  meal_id uuid not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  weekdays integer[] not null check (array_length(weekdays, 1) between 1 and 7),
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, meal_id) references baptista.meals (household_id, id) on delete cascade
);

-- Validate weekday values (1-7 ISO).
alter table baptista.meal_schedules
  add constraint meal_schedules_weekdays_range check (
    weekdays <@ array[1,2,3,4,5,6,7]
  );

create index meal_schedules_owner_idx on baptista.meal_schedules (owner_user_id, active);

create trigger meal_schedules_insert before insert on baptista.meal_schedules
  for each row execute function baptista.tg_record_insert();
create trigger meal_schedules_guard before update on baptista.meal_schedules
  for each row execute function baptista.tg_record_update();
create trigger meal_schedules_touch before update on baptista.meal_schedules
  for each row execute function baptista.tg_touch();

alter table baptista.meal_schedules enable row level security;
create policy meal_schedules_select on baptista.meal_schedules for select to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));
create policy meal_schedules_insert on baptista.meal_schedules for insert to authenticated
  with check (owner_user_id = auth.uid() and baptista.can_access(household_id, owner_user_id, visibility));
create policy meal_schedules_update on baptista.meal_schedules for update to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility))
  with check (baptista.can_access(household_id, owner_user_id, visibility));
create policy meal_schedules_delete on baptista.meal_schedules for delete to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));

revoke all on baptista.meal_schedules from public, anon, authenticated;
grant select, delete on baptista.meal_schedules to authenticated;
grant insert (household_id, meal_id, slot, weekdays, active),
      update (slot, weekdays, active)
  on baptista.meal_schedules to authenticated;
grant all on baptista.meal_schedules to service_role;

-- A4. schedule_id on diet_entries -------------------------------------------------

alter table baptista.diet_entries
  add column schedule_id uuid references baptista.meal_schedules(id) on delete set null;

-- Update GRANT INSERT on diet_entries to include schedule_id.
grant insert (schedule_id) on baptista.diet_entries to authenticated;
