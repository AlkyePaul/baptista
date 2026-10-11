-- D31 (user 2026-10-11): household food catalog. Every food in the pantry, on the shopping list,
-- in a recipe or in a meal is a catalog food (Open Food Facts or added by a member); nutrition
-- lives once, in the catalog. Recipes become their own tables (cookbook: catalog ingredients with
-- optional quantities + preparation); meals are lists of catalog foods with grams (calories).
-- Staples become a flag on the food. The personal watchlist is removed (D26 revised).

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table baptista.foods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  name_key text generated always as (baptista.name_key(name)) stored,
  brand text check (brand is null or char_length(brand) <= 80),
  brand_key text generated always as (baptista.name_key(coalesce(brand, ''))) stored,
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  category text not null default 'other'
    check (category in ('produce', 'dairy', 'meat_fish', 'bakery', 'ready_meal', 'pantry', 'frozen', 'drinks', 'other')),
  default_storage text not null default 'pantry' check (default_storage in ('fridge', 'freezer', 'pantry')),
  kcal_100g numeric(7, 2) check (kcal_100g is null or kcal_100g between 0 and 1000),
  protein_100g numeric(6, 2) check (protein_100g is null or protein_100g between 0 and 100),
  carbs_100g numeric(6, 2) check (carbs_100g is null or carbs_100g between 0 and 100),
  fat_100g numeric(6, 2) check (fat_100g is null or fat_100g between 0 and 100),
  nutrition_source text check (nutrition_source is null or nutrition_source in ('manual', 'openfoodfacts')),
  -- C8: null = never decided, true = «Abituale», false = «No, non chiederlo più».
  staple boolean,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create unique index foods_barcode_idx on baptista.foods (household_id, barcode) where barcode is not null;
create unique index foods_name_idx on baptista.foods (household_id, name_key, brand_key) where barcode is null;
create index foods_name_search_idx on baptista.foods (household_id, name_key);

create function baptista.tg_food_catalog_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.brand := nullif(btrim(new.brand), '');
  if new.kcal_100g is null and new.protein_100g is null and new.carbs_100g is null and new.fat_100g is null then
    new.nutrition_source := null;
  elsif new.nutrition_source is null then
    new.nutrition_source := 'manual';
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' and (new.household_id <> old.household_id or new.created_by is distinct from old.created_by) then
    raise exception 'immutable_field' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger foods_write before insert or update on baptista.foods
  for each row execute function baptista.tg_food_catalog_write();
create trigger foods_touch before update on baptista.foods
  for each row execute function baptista.tg_touch();

-- Find a catalog food by barcode, else by name + brand, else create it. Caller's privileges (RLS:
-- active member). Used by the app when a product is picked from Open Food Facts or typed as new.
create function baptista.ensure_food(
  p_household_id uuid, p_name text, p_brand text default null, p_barcode text default null,
  p_category text default null, p_storage text default null,
  p_kcal numeric default null, p_protein numeric default null, p_carbs numeric default null, p_fat numeric default null,
  p_source text default null
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
                              kcal_100g, protein_100g, carbs_100g, fat_100g, nutrition_source)
  values (p_household_id, p_name, p_brand, p_barcode, coalesce(p_category, 'other'),
          coalesce(p_storage, case when p_category in ('produce', 'dairy', 'meat_fish', 'ready_meal') then 'fridge'
                                   when p_category = 'frozen' then 'freezer' else 'pantry' end),
          p_kcal, p_protein, p_carbs, p_fat, p_source)
  on conflict do nothing
  returning id into fid;
  if fid is null then
    -- A concurrent insert of the same product: read it back.
    select id into fid from baptista.foods
     where household_id = p_household_id
       and ((p_barcode is not null and barcode = p_barcode)
            or (barcode is null and name_key = baptista.name_key(p_name) and brand_key = baptista.name_key(coalesce(p_brand, ''))))
     limit 1;
  end if;
  return fid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pantry items reference the catalog; name and nutrition are a copy kept in sync
-- ---------------------------------------------------------------------------

alter table baptista.food_items
  add column food_id uuid,
  add constraint food_items_food_fk foreign key (household_id, food_id) references baptista.foods (household_id, id);

-- Resolves (or creates) the catalog food, then copies its facts onto the item: every pantry item
-- is a catalog food. Runs before the identity triggers (alphabetical order).
create function baptista.tg_food_item_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f record;
begin
  if tg_op = 'UPDATE' and new.food_id is distinct from old.food_id then
    raise exception 'immutable_field' using errcode = '42501';
  end if;
  if new.food_id is null then
    new.food_id := baptista.ensure_food(new.household_id, new.product_name, new.brand, new.barcode, new.category,
                                        new.storage, new.kcal_100g, new.protein_100g, new.carbs_100g, new.fat_100g,
                                        new.nutrition_source);
  end if;
  select name, brand, barcode, category, kcal_100g, protein_100g, carbs_100g, fat_100g, nutrition_source into f
    from baptista.foods where id = new.food_id and household_id = new.household_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  new.product_name := f.name;
  new.brand := f.brand;
  new.barcode := f.barcode;
  new.category := f.category;
  new.kcal_100g := f.kcal_100g;
  new.protein_100g := f.protein_100g;
  new.carbs_100g := f.carbs_100g;
  new.fat_100g := f.fat_100g;
  new.nutrition_source := f.nutrition_source;
  return new;
end;
$$;
create trigger food_items_catalog before insert or update on baptista.food_items
  for each row execute function baptista.tg_food_item_catalog();
alter table baptista.food_items alter column food_id set not null;
create index food_items_food_idx on baptista.food_items (food_id) where status in ('available', 'opened');

-- ---------------------------------------------------------------------------
-- Shopping list: food rows reference the catalog («Altro» stays free text)
-- ---------------------------------------------------------------------------

alter table baptista.shopping_items
  add column food_id uuid,
  add constraint shopping_items_food_fk foreign key (household_id, food_id) references baptista.foods (household_id, id);

create function baptista.tg_shopping_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f record;
begin
  if new.kind = 'other' then
    if new.food_id is not null then
      raise exception 'invalid' using errcode = '22023';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.food_id is distinct from old.food_id then
    raise exception 'immutable_field' using errcode = '42501';
  end if;
  if new.food_id is null then
    new.food_id := baptista.ensure_food(new.household_id, new.name, new.brand, new.barcode, new.category, new.storage,
                                        new.kcal_100g, new.protein_100g, new.carbs_100g, new.fat_100g, null);
  end if;
  select name, brand, barcode, category, default_storage, kcal_100g, protein_100g, carbs_100g, fat_100g into f
    from baptista.foods where id = new.food_id and household_id = new.household_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  new.name := f.name;
  new.brand := f.brand;
  new.barcode := f.barcode;
  new.category := f.category;
  new.storage := coalesce(new.storage, f.default_storage);
  new.kcal_100g := f.kcal_100g;
  new.protein_100g := f.protein_100g;
  new.carbs_100g := f.carbs_100g;
  new.fat_100g := f.fat_100g;
  return new;
end;
$$;
create trigger shopping_items_catalog before insert or update on baptista.shopping_items
  for each row execute function baptista.tg_shopping_catalog();
alter table baptista.shopping_items add constraint shopping_items_food_required check ((kind = 'food') = (food_id is not null));
create index shopping_items_food_idx on baptista.shopping_items (food_id) where status = 'open';

-- A catalog edit (name, nutrition) reaches the open list rows and the items still in the house.
create function baptista.tg_food_catalog_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.name, new.brand, new.barcode, new.category, new.kcal_100g, new.protein_100g, new.carbs_100g, new.fat_100g, new.nutrition_source)
     is distinct from
     (old.name, old.brand, old.barcode, old.category, old.kcal_100g, old.protein_100g, old.carbs_100g, old.fat_100g, old.nutrition_source) then
    update baptista.food_items set food_id = food_id
     where food_id = new.id and status in ('available', 'opened');
    update baptista.shopping_items set food_id = food_id
     where food_id = new.id and status = 'open';
  end if;
  if new.staple is distinct from old.staple then
    perform baptista.emit_event(new.household_id, 'pantry.staple_changed', 'food', new.id, 'household', null,
      jsonb_build_object('staple', new.staple), 'pantry.staple_changed:' || new.id || ':' || new.version);
  end if;
  return null;
end;
$$;
create trigger foods_sync after update on baptista.foods
  for each row execute function baptista.tg_food_catalog_sync();

-- Same product again on the list (same catalog food) adds to the open row's quantity.
drop function baptista.add_shopping_item(uuid, text, text, numeric, text, text, text, text, text, numeric, numeric, numeric, numeric);
create function baptista.add_shopping_item(
  p_household_id uuid, p_kind text, p_name text default null, p_quantity numeric default null, p_unit text default null,
  p_food_id uuid default null, p_storage text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  existing record;
  fid uuid := p_food_id;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('baptista.shopping:' || p_household_id, 0));
  if p_kind = 'food' and fid is null then
    if p_name is null then
      raise exception 'invalid' using errcode = '22023';
    end if;
    fid := baptista.ensure_food(p_household_id, p_name);
  end if;
  select id, quantity, unit into existing
    from baptista.shopping_items
   where household_id = p_household_id and status = 'open' and kind = p_kind
     and ((p_kind = 'food' and food_id = fid) or (p_kind = 'other' and name_key = baptista.name_key(p_name)))
   order by created_at
   limit 1;
  if found then
    if coalesce(p_unit, existing.unit) is not distinct from existing.unit then
      update baptista.shopping_items
         set quantity = least(999999, coalesce(existing.quantity, 1) + coalesce(p_quantity, 1)),
             unit = coalesce(existing.unit, p_unit)
       where id = existing.id;
    end if;
    return existing.id;
  end if;
  insert into baptista.shopping_items (household_id, kind, name, food_id, quantity, unit, storage, sort_order)
  values (p_household_id, p_kind, coalesce(btrim(p_name), ''), fid, p_quantity, p_unit, p_storage,
          (select coalesce(max(s.sort_order), 0) + 1 from baptista.shopping_items s
            where s.household_id = p_household_id and s.status = 'open' and s.sort_order < 100000))
  returning id into new_id;
  return new_id;
end;
$$;

-- Stocking copies the catalog food into the pantry.
create or replace function baptista.stock_shopping_items(p_household_id uuid, p_ids uuid[], p_bulk boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := baptista.require_uid();
  tz text;
  today date;
  batch uuid := gen_random_uuid();
  r record;
  fid uuid;
  stocked jsonb := '[]'::jsonb;
begin
  if not baptista.is_active_member(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 200 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  select timezone into tz from baptista.households where id = p_household_id;
  today := (now() at time zone tz)::date;
  perform pg_advisory_xact_lock(hashtextextended('baptista.shopping:' || p_household_id, 0));

  for r in
    select * from baptista.shopping_items
     where household_id = p_household_id and id = any (p_ids) and kind = 'food' and status = 'open'
     order by sort_order, created_at
  loop
    insert into baptista.food_items (household_id, food_id, visibility, product_name, quantity, unit, storage, status, purchased_on)
    values (p_household_id, r.food_id, 'household', r.name, coalesce(r.quantity, 1), coalesce(r.unit, 'pz'), r.storage,
            'available', today)
    returning id into fid;
    update baptista.shopping_items
       set status = 'stocked', food_item_id = fid, stock_batch_id = batch, stocked_at = now()
     where id = r.id;
    stocked := stocked || jsonb_build_object('id', r.id, 'food_item_id', fid, 'name', r.name, 'storage', r.storage);
  end loop;

  if jsonb_array_length(stocked) > 0 then
    perform baptista.emit_event(p_household_id, 'shopping.items_stocked', 'shopping_batch', batch, 'household', uid,
      jsonb_build_object('bulk', coalesce(p_bulk, false), 'count', jsonb_array_length(stocked)),
      'shopping.items_stocked:' || batch);
  end if;
  return jsonb_build_object('batch_id', case when jsonb_array_length(stocked) > 0 then batch end, 'items', stocked);
end;
$$;

-- Staples are a flag on the catalog food now.
drop function baptista.set_pantry_staple(uuid, text, text, text);
drop table baptista.pantry_staples;
drop function baptista.tg_emit_staple_events();

create function baptista.food_in_pantry(p_food_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from baptista.food_items f where f.food_id = p_food_id and f.status in ('available', 'opened'));
$$;

create function baptista.food_on_list(p_food_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from baptista.shopping_items s where s.food_id = p_food_id and s.status = 'open');
$$;

drop function baptista.in_pantry(uuid, text, text);
drop function baptista.on_shopping_list(uuid, text, text);

-- ---------------------------------------------------------------------------
-- Recipes: the family cookbook. Ingredients are catalog foods; the quantity is optional.
-- ---------------------------------------------------------------------------

create table baptista.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  servings integer check (servings is null or servings between 1 and 50),
  body text check (body is null or char_length(body) <= 20000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create index recipes_household_idx on baptista.recipes (household_id, title);

create table baptista.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  recipe_id uuid not null,
  food_id uuid not null,
  amount numeric(10, 2) check (amount is null or (amount > 0 and amount <= 100000)),
  unit text check (unit is null or unit in ('g', 'kg', 'ml', 'l', 'pz', 'cucchiaio', 'cucchiaino', 'spicchio', 'pizzico', 'qb')),
  position integer not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default now(),
  foreign key (household_id, recipe_id) references baptista.recipes (household_id, id) on delete cascade,
  foreign key (household_id, food_id) references baptista.foods (household_id, id),
  check (unit is null or unit = 'qb' or amount is not null),
  unique (recipe_id, food_id)
);
create index recipe_ingredients_recipe_idx on baptista.recipe_ingredients (recipe_id, position);

do $$
begin
  create trigger recipes_insert before insert on baptista.recipes
    for each row execute function baptista.tg_record_insert();
  create trigger recipes_guard before update on baptista.recipes
    for each row execute function baptista.tg_record_update();
  create trigger recipes_touch before update on baptista.recipes
    for each row execute function baptista.tg_touch();
  create trigger recipes_derived after update or delete on baptista.recipes
    for each row execute function baptista.tg_record_derived();
end;
$$;

-- Recipe notes become recipes: title and preparation kept, the old free-text ingredient lines are
-- appended to the preparation (nothing is lost; structured ingredients are added by hand).
insert into baptista.recipes (household_id, owner_user_id, created_by, visibility, title, body, created_at, updated_at)
select n.household_id, n.owner_user_id, n.created_by, n.visibility, n.title,
       nullif(btrim(concat_ws(E'\n\n', n.body,
         case when jsonb_array_length(n.items) > 0 then
           'Ingredienti (da collegare all''elenco alimenti):' || E'\n'
           || (select string_agg('- ' || (e ->> 'text'), E'\n') from jsonb_array_elements(n.items) e)
         end)), ''),
       n.created_at, n.updated_at
  from baptista.notes n where n.kind = 'recipe';
delete from baptista.notes where kind = 'recipe';
alter table baptista.notes drop constraint notes_kind_check;
alter table baptista.notes add constraint notes_kind_check check (kind in ('note', 'list'));

-- ---------------------------------------------------------------------------
-- Meals: catalog foods with grams (0 allowed: garlic barely counts). Nutrition is read live from
-- the catalog; the diary keeps its own snapshot.
-- ---------------------------------------------------------------------------

alter table baptista.meals drop column items;
drop function baptista.valid_meal_items(jsonb);

create table baptista.meal_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  meal_id uuid not null,
  food_id uuid not null,
  grams numeric(7, 1) not null default 0 check (grams between 0 and 5000),
  position integer not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default now(),
  foreign key (household_id, meal_id) references baptista.meals (household_id, id) on delete cascade,
  foreign key (household_id, food_id) references baptista.foods (household_id, id)
);
create index meal_items_meal_idx on baptista.meal_items (meal_id, position);

-- Grams from a recipe quantity: weights and volumes convert, everything else counts as 0 g.
create function baptista.recipe_grams(p_amount numeric, p_unit text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_amount is null then 0
    when p_unit in ('g', 'ml') then least(5000, p_amount)
    when p_unit in ('kg', 'l') then least(5000, p_amount * 1000)
    else 0
  end;
$$;

-- «Aggiungi al pasto»: the recipe's ingredients join the meal (existing foods keep their grams).
-- Caller's privileges: both records must be readable and the meal writable.
create function baptista.add_recipe_to_meal(p_recipe_id uuid, p_meal_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  m record;
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select id, household_id into m from baptista.meals where id = p_meal_id;
  if not found or not exists (select 1 from baptista.recipes r where r.id = p_recipe_id and r.household_id = m.household_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into baptista.meal_items (household_id, meal_id, food_id, grams, position)
  select m.household_id, m.id, i.food_id, baptista.recipe_grams(i.amount, i.unit),
         coalesce((select max(x.position) from baptista.meal_items x where x.meal_id = m.id), 0) + i.position + 1
    from baptista.recipe_ingredients i
   where i.recipe_id = p_recipe_id
     and not exists (select 1 from baptista.meal_items x where x.meal_id = m.id and x.food_id = i.food_id);
  get diagnostics n = row_count;
  update baptista.meals set title = title where id = m.id; -- bumps version and updated_at
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Watchlist removed (user 2026-10-11: no market tracking in Finanze).
-- ---------------------------------------------------------------------------

drop table baptista.watchlist_items;
drop function baptista.tg_watchlist_insert();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table baptista.foods enable row level security;
create policy foods_select on baptista.foods for select to authenticated using (baptista.is_active_member(household_id));
create policy foods_insert on baptista.foods for insert to authenticated with check (baptista.is_active_member(household_id));
create policy foods_update on baptista.foods for update to authenticated
  using (baptista.is_active_member(household_id)) with check (baptista.is_active_member(household_id));
create policy foods_delete on baptista.foods for delete to authenticated using (baptista.is_active_member(household_id));

alter table baptista.recipes enable row level security;
create policy recipes_select on baptista.recipes for select to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));
create policy recipes_insert on baptista.recipes for insert to authenticated
  with check (owner_user_id = (select auth.uid()) and baptista.can_access(household_id, owner_user_id, visibility));
create policy recipes_update on baptista.recipes for update to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility))
  with check (baptista.can_access(household_id, owner_user_id, visibility));
create policy recipes_delete on baptista.recipes for delete to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));

-- Ingredients and meal lines follow their parent (read and written through its RLS).
alter table baptista.recipe_ingredients enable row level security;
create policy recipe_ingredients_all on baptista.recipe_ingredients for all to authenticated
  using (exists (select 1 from baptista.recipes r where r.id = recipe_id and r.household_id = recipe_ingredients.household_id))
  with check (exists (select 1 from baptista.recipes r where r.id = recipe_id and r.household_id = recipe_ingredients.household_id));
alter table baptista.meal_items enable row level security;
create policy meal_items_all on baptista.meal_items for all to authenticated
  using (exists (select 1 from baptista.meals m where m.id = meal_id and m.household_id = meal_items.household_id))
  with check (exists (select 1 from baptista.meals m where m.id = meal_id and m.household_id = meal_items.household_id));

revoke all on baptista.foods, baptista.recipes, baptista.recipe_ingredients, baptista.meal_items from public, anon, authenticated;
grant select, delete on baptista.foods, baptista.recipes, baptista.recipe_ingredients, baptista.meal_items to authenticated;
grant insert (household_id, name, brand, barcode, category, default_storage, kcal_100g, protein_100g, carbs_100g, fat_100g,
              nutrition_source, staple),
      update (name, brand, barcode, category, default_storage, kcal_100g, protein_100g, carbs_100g, fat_100g,
              nutrition_source, staple)
  on baptista.foods to authenticated;
grant insert (household_id, visibility, title, servings, body), update (visibility, title, servings, body)
  on baptista.recipes to authenticated;
grant insert (household_id, recipe_id, food_id, amount, unit, position), update (amount, unit, position)
  on baptista.recipe_ingredients to authenticated;
grant insert (household_id, meal_id, food_id, grams, position), update (grams, position)
  on baptista.meal_items to authenticated;
grant insert (food_id) on baptista.food_items to authenticated;
-- Name and nutrition of a pantry item come from the catalog: edit the food, not the item.
revoke update (product_name, brand, barcode, category, kcal_100g, protein_100g, carbs_100g, fat_100g, nutrition_source)
  on baptista.food_items from authenticated;
grant insert (food_id) on baptista.shopping_items to authenticated;
revoke insert (brand, barcode, category, kcal_100g, protein_100g, carbs_100g, fat_100g) on baptista.shopping_items from authenticated;
revoke update (name) on baptista.shopping_items from authenticated;
grant all on baptista.foods, baptista.recipes, baptista.recipe_ingredients, baptista.meal_items to service_role;

-- ---------------------------------------------------------------------------
-- Detectors v5: restock and staples follow the catalog food (no name matching).
-- ---------------------------------------------------------------------------

create or replace function baptista._refresh_observations(p_household_id uuid, p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  local_now timestamp;
  today date;
  week_start date;
  prev_week_start date;
  week_end_at timestamptz;
  days_left integer;
  month_start date;
  month_end date;
  rv integer := baptista.ranking_version();
  active_count integer;
begin
  select timezone into tz from baptista.households where id = p_household_id;
  if tz is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  local_now := p_now at time zone tz;
  today := local_now::date;
  week_start := today - (extract(isodow from today)::integer - 1);
  prev_week_start := week_start - 7;
  week_end_at := (week_start + 7)::timestamp at time zone tz;
  days_left := 8 - extract(isodow from today)::integer;
  month_start := date_trunc('month', today)::date;
  month_end := (month_start + interval '1 month')::date;

  with candidates as (
    select 'upcoming_calendar'::text as type, e.title,
           'Inizia ' || baptista.it_day(e.starts_at at time zone tz) || ' alle ' || to_char(e.starts_at at time zone tz, 'HH24:MI') as description,
           'calendar_event'::text as source_type, e.id as source_id,
           'upcoming_calendar:' || e.id || ':' || (e.starts_at at time zone tz)::date as dedupe_key,
           e.visibility, e.owner_user_id,
           greatest(0.3, least(1, 1 - extract(epoch from (e.starts_at - p_now)) / 86400.0))::numeric as urgency,
           0.5::numeric as importance, 1::numeric as confidence, 0.4::numeric as actionability,
           e.starts_at as valid_until,
           jsonb_build_object('starts_at', e.starts_at, 'all_day', false) as data
      from baptista.calendar_events e
     where e.household_id = p_household_id and not e.all_day
       and e.starts_at > p_now and e.starts_at <= p_now + interval '24 hours'
    union all
    select 'upcoming_calendar', e.title,
           case when e.start_date <= today then 'Tutto il giorno, oggi' else 'Tutto il giorno, domani' end,
           'calendar_event', e.id,
           'upcoming_calendar:' || e.id || ':' || greatest(e.start_date, today),
           e.visibility, e.owner_user_id,
           case when e.start_date <= today then 0.8 else 0.5 end,
           0.5, 1, 0.4,
           (e.end_date::timestamp at time zone tz),
           jsonb_build_object('start_date', greatest(e.start_date, today), 'end_date', e.end_date, 'all_day', true)
      from baptista.calendar_events e
     where e.household_id = p_household_id and e.all_day
       and e.start_date <= (local_now + interval '24 hours')::date and e.end_date > today
    union all
    select 'overdue_task', 'In ritardo: ' || t.title,
           'Scadeva ' || baptista.it_day(t.due_date) || ' (' || (today - t.due_date)
             || case when today - t.due_date = 1 then ' giorno fa)' else ' giorni fa)' end,
           'task', t.id, 'overdue_task:' || t.id || ':' || t.due_date,
           t.visibility, t.owner_user_id,
           least(1, 0.6 + 0.05 * (today - t.due_date)), 0.6, 1, 1,
           null::timestamptz,
           jsonb_build_object('due_date', t.due_date, 'days_overdue', today - t.due_date, 'title', t.title)
      from baptista.tasks t
     where t.household_id = p_household_id and t.status = 'open' and t.due_date < today
    union all
    select 'missed_habit', h.title || ': ' || coalesce(c.n, 0) || ' su ' || h.target_per_week || ' registrate la settimana scorsa',
           'Conta solo le registrazioni. Se l''hai fatto senza registrarlo, puoi ancora aggiungerlo.',
           'habit', h.id, 'missed_habit:' || h.id || ':' || prev_week_start,
           h.visibility, h.owner_user_id,
           0.3, 0.4, 0.6, 0.3,
           week_end_at,
           jsonb_build_object('week_start', prev_week_start, 'logged', coalesce(c.n, 0), 'target', h.target_per_week,
                              'title', h.title)
      from baptista.habits h
      left join lateral (
        select count(*)::integer as n from baptista.habit_entries x
         where x.habit_id = h.id and x.performed_on >= prev_week_start and x.performed_on < week_start
      ) c on true
     where h.household_id = p_household_id and h.active and h.starts_on <= prev_week_start
       and coalesce(c.n, 0) < h.target_per_week
    union all
    select 'habit_progress', h.title || ': ' || coalesce(c.n, 0) || '/' || h.target_per_week || ' questa settimana',
           'Ne mancano ' || (h.target_per_week - coalesce(c.n, 0)) || ', '
             || case when days_left = 1 then 'resta 1 giorno' else 'restano ' || days_left || ' giorni' end,
           'habit', h.id, 'habit_progress:' || h.id || ':' || week_start,
           h.visibility, h.owner_user_id,
           least(1, (h.target_per_week - coalesce(c.n, 0))::numeric / days_left), 0.4, 1, 0.8,
           week_end_at,
           jsonb_build_object('week_start', week_start, 'logged', coalesce(c.n, 0), 'target', h.target_per_week,
                              'days_left', days_left, 'title', h.title, 'done_today', coalesce(c.is_today, false))
      from baptista.habits h
      left join lateral (
        select count(*)::integer as n, bool_or(x.performed_on = today) as is_today from baptista.habit_entries x
         where x.habit_id = h.id and x.performed_on >= week_start and x.performed_on <= today
      ) c on true
     where h.household_id = p_household_id and h.active and h.starts_on <= today
       and coalesce(c.n, 0) < h.target_per_week
    union all
    select 'goal_progress',
           g.title || ': ' || baptista.goal_percent(g.start_value, g.current_value, g.target_value) || '%',
           trim('da ' || baptista.it_number(g.start_value) || ' a ' || baptista.it_number(g.target_value)
             || coalesce(' ' || g.unit, '') || ', ora ' || baptista.it_number(g.current_value)),
           'goal', g.id, 'goal_progress:' || g.id || ':' || (ev.occurred_at at time zone tz)::date,
           g.visibility, g.owner_user_id,
           0.2, 0.5, 1, 0.2,
           ev.occurred_at + interval '24 hours',
           jsonb_build_object('start', g.start_value, 'current', g.current_value, 'target', g.target_value,
                              'unit', g.unit, 'title', g.title,
                              'percent', baptista.goal_percent(g.start_value, g.current_value, g.target_value))
      from baptista.goals g
      join lateral (
        select max(occurred_at) as occurred_at from baptista.events v
         where v.source_id = g.id and v.event_type = 'goal.progress_changed'
      ) ev on ev.occurred_at is not null and ev.occurred_at > p_now - interval '24 hours'
     where g.household_id = p_household_id
    union all
    select 'food_expiry',
           case
             when f.explicit_expires_on is null then 'Controlla: ' || f.product_name
             when x.d < today then 'Scadenza superata: ' || f.product_name
             when x.d = today then f.product_name || ' scade oggi'
             when x.d = today + 1 then f.product_name || ' scade domani'
             else f.product_name || ' scade ' || baptista.it_day(x.d)
           end,
           case
             when f.explicit_expires_on is null then
               'Data stimata ' || baptista.it_day(x.d) || ', non indicata sulla confezione. Se è ancora lì, dai un''occhiata.'
             when x.d < today then
               'Data sulla confezione: ' || baptista.it_day(x.d) || ' (' || (today - x.d)
                 || case when today - x.d = 1 then ' giorno fa)' else ' giorni fa)' end
             else 'Data sulla confezione: ' || baptista.it_day(x.d)
           end,
           'food_item', f.id, 'food_expiry:' || f.id || ':' || x.d,
           f.visibility, f.owner_user_id,
           case
             when x.d < today then 1
             when x.d = today then 0.95
             when x.d = today + 1 then 0.8
             else 0.65
           end * case when f.explicit_expires_on is null then 0.7 else 1 end,
           0.6,
           case when f.explicit_expires_on is null then 0.5 else 1 end,
           0.9,
           null::timestamptz,
           jsonb_build_object('expires_on', x.d, 'days_left', x.d - today,
                              'estimated', f.explicit_expires_on is null, 'storage', f.storage,
                              'name', f.product_name)
      from baptista.food_items f
      cross join lateral (select coalesce(f.explicit_expires_on, f.estimated_expires_on) as d) x
     where f.household_id = p_household_id and f.status in ('available', 'opened')
       and x.d is not null and x.d <= today + 2
    union all
    select 'old_food',
           f.product_name || ': in frigo da ' || (today - x.since) || ' giorni',
           'Nessuna data registrata. È un promemoria per controllare, non un''indicazione sulla sicurezza.',
           'food_item', f.id, 'old_food:' || f.id,
           f.visibility, f.owner_user_id,
           0.4, 0.4, 0.5, 0.7,
           null::timestamptz,
           jsonb_build_object('days', today - x.since, 'estimated', true, 'storage', f.storage, 'name', f.product_name)
      from baptista.food_items f
      cross join lateral (select coalesce(f.purchased_on, (f.created_at at time zone tz)::date) as since) x
     where f.household_id = p_household_id and f.status in ('available', 'opened')
       and f.storage = 'fridge'
       and f.category in ('produce', 'dairy', 'meat_fish', 'bakery', 'ready_meal')
       and f.explicit_expires_on is null and f.estimated_expires_on is null
       and x.since <= today - 7
    union all
    -- B-7 food_opened: opened in the fridge for 3+ days, no near date. Always a check, never a fact.
    select 'food_opened',
           f.product_name || ': aperto da ' || (today - f.opened_on) || ' giorni',
           'È un promemoria per controllare com''è, non un''indicazione sulla sicurezza.',
           'food_item', f.id, 'food_opened:' || f.id,
           f.visibility, f.owner_user_id,
           0.45, 0.4, 0.5, 0.8,
           null::timestamptz,
           jsonb_build_object('days', today - f.opened_on, 'estimated', true, 'storage', f.storage, 'name', f.product_name)
      from baptista.food_items f
     where f.household_id = p_household_id and f.status = 'opened' and f.storage = 'fridge'
       and f.opened_on is not null and f.opened_on <= today - 3
       and coalesce(f.explicit_expires_on, f.estimated_expires_on, today + 3) > today + 2
    union all
    -- B-7 calendar_overlap: two timed events overlapping in the next 48 h. The card is private when
    -- one event is private, and skipped when nobody can read both.
    select 'calendar_overlap',
           a.title || ' e ' || b.title || ' si sovrappongono',
           baptista.it_day(a.starts_at at time zone tz) || ': ' || to_char(a.starts_at at time zone tz, 'HH24:MI') || '–'
             || to_char(a.ends_at at time zone tz, 'HH24:MI') || ' e ' || to_char(b.starts_at at time zone tz, 'HH24:MI') || '–'
             || to_char(b.ends_at at time zone tz, 'HH24:MI'),
           'calendar_event', a.id, 'calendar_overlap:' || a.id || ':' || b.id,
           case when a.visibility = 'private' or b.visibility = 'private' then 'private' else 'household' end,
           case when a.visibility = 'private' then a.owner_user_id when b.visibility = 'private' then b.owner_user_id else a.owner_user_id end,
           0.7, 0.6, 1, 0.7,
           least(a.ends_at, b.ends_at),
           jsonb_build_object('starts_at', a.starts_at, 'all_day', false, 'other_id', b.id,
                              'first', a.title, 'second', b.title)
      from baptista.calendar_events a
      join baptista.calendar_events b
        on b.household_id = a.household_id and not b.all_day
       and (a.starts_at, a.id) < (b.starts_at, b.id)
       and a.starts_at < b.ends_at and b.starts_at < a.ends_at
     where a.household_id = p_household_id and not a.all_day
       and a.ends_at > p_now and b.starts_at <= p_now + interval '48 hours'
       and not (a.visibility = 'private' and b.visibility = 'private' and a.owner_user_id is distinct from b.owner_user_id)
       and (a.visibility = 'household' or a.owner_user_id is not null)
       and (b.visibility = 'household' or b.owner_user_id is not null)
    union all
    -- A-2 wardrobe_acquisition: a new item (last 14 days) whose origin is still unknown; only its owner is asked.
    select 'wardrobe_acquisition', 'L''hai comprato?', w.name,
           'wardrobe_item', w.id, 'wardrobe_acquisition:' || w.id,
           'private', w.owner_user_id,
           0.5, 0.5, 1, 1,
           w.created_at + interval '14 days',
           jsonb_build_object('name', w.name, 'type', w.type, 'brand', w.brand, 'thumb_path', w.thumb_path,
                              'private', w.visibility = 'private')
      from baptista.wardrobe_items w
     where w.household_id = p_household_id and w.status = 'active' and w.acquisition = 'unknown'
       and w.owner_user_id is not null and w.created_at > p_now - interval '14 days'
    union all
    -- C1 shopping_expense_question: only after «Tutto in dispensa» (bulk), asked to who did it.
    select 'shopping_expense_question', 'Vuoi registrare la spesa di oggi?',
           c.n || case when c.n = 1 then ' prodotto appena messo in dispensa' else ' prodotti appena messi in dispensa' end,
           'shopping_batch', ev.source_id, 'shopping_expense_question:' || ev.source_id,
           'private', ev.actor_user_id,
           0.7, 0.5, 1, 1,
           ev.occurred_at + interval '2 days',
           jsonb_build_object('count', c.n, 'stocked_on', (ev.occurred_at at time zone tz)::date, 'names', c.names)
      from baptista.events ev
      join lateral (
        select count(*)::integer as n, jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.sort_order, s.created_at) as names
          from baptista.shopping_items s
         where s.stock_batch_id = ev.source_id and s.status = 'stocked' and s.expense_id is null
      ) c on c.n > 0
     where ev.household_id = p_household_id and ev.event_type = 'shopping.items_stocked'
       and ev.payload ->> 'bulk' = 'true' and ev.actor_user_id is not null
       and ev.occurred_at > p_now - interval '2 days'
    union all
    -- C2 restock_question: a food just finished, none left, not on the list and not a staple (C8).
    select 'restock_question', f.product_name || ' è finito', 'Lo aggiungo alla Lista della spesa?',
           'food_item', f.id, 'restock_question:' || f.id,
           'private', ev.actor_user_id,
           0.45, 0.4, 1, 1,
           f.closed_at + interval '3 days',
           jsonb_build_object('name', f.product_name, 'food_id', f.food_id, 'status', f.status)
      from baptista.food_items f
      join baptista.foods fd on fd.id = f.food_id
      join lateral (
        select v.actor_user_id from baptista.events v
         where v.source_id = f.id and v.event_type in ('food.item_consumed', 'food.item_discarded')
         order by v.occurred_at desc limit 1
      ) ev on ev.actor_user_id is not null
     where f.household_id = p_household_id and f.status in ('consumed', 'discarded')
       and f.closed_at > p_now - interval '3 days'
       and fd.staple is not true
       and not baptista.food_in_pantry(f.food_id)
       and not baptista.food_on_list(f.food_id)
    union all
    -- C4 diet_log_question: a consumed food with known kcal, asked only to who marked it.
    select 'diet_log_question', f.product_name || ': lo aggiungo al diario?', 'Hai segnato che è finito.',
           'food_item', f.id, 'diet_log_question:' || f.id,
           'private', ev.actor_user_id,
           0.35, 0.3, 1, 1,
           f.closed_at + interval '12 hours',
           jsonb_build_object('name', f.product_name, 'kcal_100g', f.kcal_100g)
      from baptista.food_items f
      join lateral (
        select v.actor_user_id from baptista.events v
         where v.source_id = f.id and v.event_type = 'food.item_consumed'
         order by v.occurred_at desc limit 1
      ) ev on ev.actor_user_id is not null
     where f.household_id = p_household_id and f.status = 'consumed' and f.kcal_100g is not null
       and f.closed_at > p_now - interval '12 hours'
    union all
    -- C5 wardrobe_from_expense: a clothing expense of the last 7 days without a linked item.
    select 'wardrobe_from_expense', 'Vuoi aggiungere il capo al guardaroba?',
           coalesce(e.description, e.merchant) || ' · ' || baptista.it_number(e.total) || ' ' || e.currency,
           'expense', e.id, 'wardrobe_from_expense:' || e.id,
           'private', e.owner_user_id,
           0.3, 0.4, 1, 0.8,
           e.created_at + interval '7 days',
           jsonb_build_object('label', coalesce(e.description, e.merchant), 'total', e.total, 'currency', e.currency)
      from baptista.expenses e
      join baptista.expense_categories c on c.id = e.category_id and lower(c.name) = 'abbigliamento'
     where e.household_id = p_household_id and e.owner_user_id is not null
       and e.created_at > p_now - interval '7 days'
       and not exists (select 1 from baptista.wardrobe_items w where w.expense_id = e.id)
    union all
    -- C6 budget_threshold: 80% / 100% of a monthly budget, household expenses only (private
    -- expenses never feed a shared card). One card per budget, month and level; 100% replaces 80%.
    select 'budget_threshold',
           coalesce(c.name, 'Budget totale') || case when s.spent >= b.monthly_amount then ': budget del mese superato'
                                                   else ': ' || floor(100 * s.spent / b.monthly_amount)::integer || '% del budget' end,
           'Spesi ' || baptista.it_number(s.spent) || ' ' || b.currency || ' su ' || baptista.it_number(b.monthly_amount)
             || case when s.spent >= b.monthly_amount then '.'
                     when month_end - today = 1 then ', manca 1 giorno alla fine del mese.'
                     else ', mancano ' || (month_end - today) || ' giorni alla fine del mese.' end,
           'budget', b.id,
           'budget_threshold:' || b.id || ':' || month_start || ':' || case when s.spent >= b.monthly_amount then '100' else '80' end,
           'household', null::uuid,
           case when s.spent >= b.monthly_amount then 0.9 else 0.6 end, 0.7, 1, 0.5,
           (month_end::timestamp at time zone tz),
           jsonb_build_object('spent', s.spent, 'budget', b.monthly_amount, 'currency', b.currency,
                              'percent', floor(100 * s.spent / b.monthly_amount)::integer,
                              'level', case when s.spent >= b.monthly_amount then 100 else 80 end,
                              'days_left', month_end - today, 'category', c.name)
      from baptista.budgets b
      left join baptista.expense_categories c on c.id = b.category_id
      cross join lateral (
        select coalesce(sum(e.total), 0) as spent from baptista.expenses e
         where e.household_id = b.household_id and e.currency = b.currency and e.visibility = 'household'
           and e.occurred_on >= month_start and e.occurred_on < month_end
           and (b.category_id is null or e.category_id = b.category_id)
      ) s
     where b.household_id = p_household_id and s.spent >= 0.8 * b.monthly_amount
    union all
    -- C8 staple_suggestion: stocked from the list 3+ times in 60 days, never chosen nor declined.
    select 'staple_suggestion', 'Compri spesso: ' || x.name,
           'Messo in dispensa ' || x.n || ' volte negli ultimi 60 giorni.',
           'food', x.food_id, 'staple_suggestion:' || x.food_id,
           'household', null::uuid,
           0.2, 0.3, 1, 0.6,
           null::timestamptz,
           jsonb_build_object('name', x.name, 'food_id', x.food_id, 'count', x.n)
      from (
        select s.food_id, min(s.name) as name, count(*)::integer as n
          from baptista.shopping_items s
         where s.household_id = p_household_id and s.status = 'stocked' and s.stocked_at > p_now - interval '60 days'
         group by s.food_id
        having count(*) >= 3
      ) x
      join baptista.foods fd on fd.id = x.food_id and fd.staple is null
    union all
    -- C8 staples_missing: staples with nothing in the house and nothing open on the list.
    select 'staples_missing',
           case when m.n = 1 then 'Manca un prodotto abituale: ' else 'Mancano ' || m.n || ' prodotti abituali: ' end
             || array_to_string(m.names[1:3], ', ') || case when m.n > 3 then '…' else '' end,
           'Non ce n''è in dispensa e non sono nella Lista della spesa.',
           'household', md5(p_household_id::text || ':staples_missing')::uuid, 'staples_missing:' || m.signature,
           'household', null::uuid,
           0.5, 0.5, 1, 1,
           null::timestamptz,
           jsonb_build_object('items', m.items)
      from (
        select count(*)::integer as n, array_agg(fd.name order by fd.name) as names,
               md5(string_agg(fd.id::text, '|' order by fd.id)) as signature,
               jsonb_agg(jsonb_build_object('id', fd.id, 'name', fd.name) order by fd.name) as items
          from baptista.foods fd
         where fd.household_id = p_household_id and fd.staple
           and not baptista.food_in_pantry(fd.id)
           and not baptista.food_on_list(fd.id)
      ) m
     where m.n > 0
  )
  insert into baptista.observations as o (
    household_id, type, title, description, source_type, source_id, detector_version, dedupe_key,
    visibility, owner_user_id, urgency, importance, confidence, actionability, priority_score,
    ranking_version, state, data, valid_until, last_seen_at
  )
  select p_household_id, c.type, c.title, c.description, c.source_type, c.source_id, 5, c.dedupe_key,
         c.visibility, c.owner_user_id, round(c.urgency, 3), c.importance, c.confidence, c.actionability,
         baptista.priority_score(c.urgency, c.importance, c.confidence, c.actionability),
         rv, 'active', c.data, c.valid_until, p_now
    from candidates c
  on conflict (household_id, audience_key, dedupe_key) do update
     set title = excluded.title,
         description = excluded.description,
         detector_version = excluded.detector_version,
         urgency = excluded.urgency,
         importance = excluded.importance,
         confidence = excluded.confidence,
         actionability = excluded.actionability,
         priority_score = excluded.priority_score,
         ranking_version = excluded.ranking_version,
         data = excluded.data,
         valid_until = excluded.valid_until,
         last_seen_at = excluded.last_seen_at,
         state = case when o.state = 'dismissed' then 'dismissed' else 'active' end,
         resolved_at = case when o.state = 'dismissed' then o.resolved_at else null end;

  update baptista.observations
     set state = 'resolved', resolved_at = p_now
   where household_id = p_household_id and state = 'active' and last_seen_at < p_now;

  update baptista.observations
     set state = 'expired'
   where household_id = p_household_id and state in ('active', 'dismissed')
     and valid_until is not null and valid_until <= p_now;

  insert into baptista.observation_refreshes (household_id, refreshed_at)
  values (p_household_id, p_now)
  on conflict (household_id) do update set refreshed_at = excluded.refreshed_at;

  select count(*) into active_count from baptista.observations
   where household_id = p_household_id and state = 'active';
  return active_count;
end;
$$;

revoke execute on function
  baptista.tg_food_catalog_write(),
  baptista.ensure_food(uuid, text, text, text, text, text, numeric, numeric, numeric, numeric, text),
  baptista.tg_food_item_catalog(),
  baptista.tg_shopping_catalog(),
  baptista.tg_food_catalog_sync(),
  baptista.add_shopping_item(uuid, text, text, numeric, text, uuid, text),
  baptista.food_in_pantry(uuid),
  baptista.food_on_list(uuid),
  baptista.recipe_grams(numeric, text),
  baptista.add_recipe_to_meal(uuid, uuid)
from public, anon;
revoke execute on function
  baptista.tg_food_catalog_sync(),
  baptista.food_in_pantry(uuid),
  baptista.food_on_list(uuid)
from authenticated;
grant execute on function
  baptista.ensure_food(uuid, text, text, text, text, text, numeric, numeric, numeric, numeric, text),
  baptista.add_shopping_item(uuid, text, text, numeric, text, uuid, text),
  baptista.recipe_grams(numeric, text),
  baptista.add_recipe_to_meal(uuid, uuid)
to authenticated;
grant execute on all functions in schema baptista to service_role;
