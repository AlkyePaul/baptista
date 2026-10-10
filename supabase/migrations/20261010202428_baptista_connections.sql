-- Phase 04.1 step A — connections between rooms (D30). Shopping list (Alimenti → Dispensa, Altro),
-- wardrobe acquisition with a linked expense, staple products, goals driven by a habit, and the
-- connection questions as deterministic observations (detectors v4).
-- A connection is a proposal, never an automatism: no trigger writes a domain record in another
-- room; composite gestures are single procedures. docs/phases/PHASE_04_1_CONNECTIONS_AND_BAPTISTA.md

-- ---------------------------------------------------------------------------
-- Name key shared by the list, the pantry and the staples (mirrored by lib/shopping.ts nameKey):
-- lower case, Italian accents folded, spaces collapsed.
-- ---------------------------------------------------------------------------

create function baptista.name_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    btrim(translate(lower(coalesce(p_value, '')), 'àáâäèéêëìíîïòóôöùúûü', 'aaaaeeeeiiiioooouuuu')),
    '\s+', ' ', 'g');
$$;

-- ---------------------------------------------------------------------------
-- Shopping list: one per household, always shared (no private rows, user decision 2026-10-10).
-- ---------------------------------------------------------------------------

create table baptista.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility = 'household'),
  kind text not null check (kind in ('food', 'other')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  name_key text generated always as (baptista.name_key(name)) stored,
  quantity numeric(12, 3) check (quantity is null or (quantity > 0 and quantity <= 999999)),
  unit text check (unit is null or unit in ('pz', 'g', 'kg', 'ml', 'l', 'conf')),
  -- Food only: Open Food Facts data copied when the product was chosen.
  brand text check (brand is null or char_length(brand) <= 80),
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  category text check (category is null or category in
    ('produce', 'dairy', 'meat_fish', 'bakery', 'ready_meal', 'pantry', 'frozen', 'drinks', 'other')),
  kcal_100g numeric(7, 2) check (kcal_100g is null or kcal_100g between 0 and 1000),
  protein_100g numeric(6, 2) check (protein_100g is null or protein_100g between 0 and 100),
  carbs_100g numeric(6, 2) check (carbs_100g is null or carbs_100g between 0 and 100),
  fat_100g numeric(6, 2) check (fat_100g is null or fat_100g between 0 and 100),
  storage text check (storage is null or storage in ('fridge', 'freezer', 'pantry')),
  status text not null default 'open' check (status in ('open', 'stocked', 'done', 'removed')),
  -- Set only by stock_shopping_items (traceability and undo).
  food_item_id uuid,
  stock_batch_id uuid,
  stocked_at timestamptz,
  -- Set only by register_shopping_expense (C1).
  expense_id uuid,
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check (kind = 'food' or (barcode is null and brand is null and category is null and storage is null
                           and kcal_100g is null and protein_100g is null and carbs_100g is null and fat_100g is null)),
  check (kind = 'other' or storage is not null),
  check (status <> 'stocked' or kind = 'food'),
  check (status <> 'done' or kind = 'other'),
  check ((status = 'stocked') = (stocked_at is not null)),
  foreign key (household_id, food_item_id) references baptista.food_items (household_id, id) on delete set null (food_item_id),
  foreign key (household_id, expense_id) references baptista.expenses (household_id, id) on delete set null (expense_id)
);
create index shopping_items_open_idx on baptista.shopping_items (household_id, kind, sort_order) where status = 'open';
create index shopping_items_batch_idx on baptista.shopping_items (stock_batch_id) where stock_batch_id is not null;
create index shopping_items_stocked_idx on baptista.shopping_items (household_id, name_key, stocked_at) where status = 'stocked';

-- Clients may move a row between open/done/removed; "stocked" is reachable only through the
-- stocking procedure (it creates the food in the same transaction). current_user is the
-- procedure owner inside security definer functions, `authenticated` for direct writes.
create function baptista.tg_shopping_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' and new.status <> 'open' then
      raise exception 'invalid' using errcode = '22023';
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status and 'stocked' in (new.status, old.status) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  create trigger shopping_items_insert before insert on baptista.shopping_items
    for each row execute function baptista.tg_record_insert();
  create trigger shopping_items_guard before update on baptista.shopping_items
    for each row execute function baptista.tg_record_update();
  create trigger shopping_items_status before insert or update on baptista.shopping_items
    for each row execute function baptista.tg_shopping_guard();
  create trigger shopping_items_touch before update on baptista.shopping_items
    for each row execute function baptista.tg_touch();
  create trigger shopping_items_derived after update or delete on baptista.shopping_items
    for each row execute function baptista.tg_record_derived();
end;
$$;

-- Adding the same product again (barcode, else name key) increases the open row's quantity
-- instead of creating a duplicate. Runs with the caller's privileges (RLS applies).
create function baptista.add_shopping_item(
  p_household_id uuid, p_kind text, p_name text, p_quantity numeric default null, p_unit text default null,
  p_barcode text default null, p_brand text default null, p_category text default null, p_storage text default null,
  p_kcal numeric default null, p_protein numeric default null, p_carbs numeric default null, p_fat numeric default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  existing record;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('baptista.shopping:' || p_household_id, 0));
  select id, quantity, unit into existing
    from baptista.shopping_items
   where household_id = p_household_id and status = 'open' and kind = p_kind
     and ((p_barcode is not null and barcode = p_barcode) or name_key = baptista.name_key(p_name))
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
  insert into baptista.shopping_items (household_id, kind, name, quantity, unit, barcode, brand, category, storage,
                                       kcal_100g, protein_100g, carbs_100g, fat_100g, sort_order)
  values (p_household_id, p_kind, btrim(p_name), p_quantity, p_unit, p_barcode, p_brand, p_category,
          case when p_kind = 'food' then coalesce(p_storage, 'pantry') end,
          p_kcal, p_protein, p_carbs, p_fat,
          (select coalesce(max(s.sort_order), 0) + 1 from baptista.shopping_items s
            where s.household_id = p_household_id and s.status = 'open' and s.sort_order < 100000))
  returning id into new_id;
  return new_id;
end;
$$;

-- Bought: each open food row becomes a food item in the pantry in one transaction. Ticking one
-- row passes bulk = false; «Tutto in dispensa» passes the visible open rows with bulk = true (the
-- visible list is the confirmation). A double tap finds nothing open and does nothing.
create function baptista.stock_shopping_items(p_household_id uuid, p_ids uuid[], p_bulk boolean)
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
    insert into baptista.food_items (household_id, visibility, product_name, brand, barcode, category, quantity, unit,
                                     storage, status, purchased_on, kcal_100g, protein_100g, carbs_100g, fat_100g,
                                     nutrition_source)
    values (p_household_id, 'household', r.name, r.brand, r.barcode, coalesce(r.category, 'other'),
            coalesce(r.quantity, 1), coalesce(r.unit, 'pz'), r.storage, 'available', today,
            r.kcal_100g, r.protein_100g, r.carbs_100g, r.fat_100g,
            case when r.kcal_100g is null then null when r.barcode is not null then 'openfoodfacts' else 'manual' end)
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

-- Undo: removes the food created by the stocking only if nobody changed it since (version 1,
-- still available), then reopens the row. All or nothing.
create function baptista.unstock_shopping_items(p_household_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  perform baptista.require_uid();
  if not baptista.is_active_member(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('baptista.shopping:' || p_household_id, 0));
  for r in
    select s.id, s.food_item_id, f.version as food_version, f.status as food_status
      from baptista.shopping_items s
      left join baptista.food_items f on f.id = s.food_item_id
     where s.household_id = p_household_id and s.id = any (p_ids) and s.status = 'stocked'
  loop
    if r.food_item_id is null or r.food_version <> 1 or r.food_status <> 'available' then
      raise exception 'conflict' using errcode = '40001';
    end if;
    update baptista.shopping_items
       set status = 'open', food_item_id = null, stock_batch_id = null, stocked_at = null
     where id = r.id;
    delete from baptista.food_items where id = r.food_item_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expenses: event on creation (C5 and budget questions react to it, D17).
-- ---------------------------------------------------------------------------

create function baptista.tg_emit_expense_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform baptista.emit_event(new.household_id, 'finance.expense_added', 'expense', new.id,
    new.visibility, new.owner_user_id, jsonb_build_object('currency', new.currency),
    'finance.expense_added:' || new.id);
  return null;
end;
$$;
create trigger expenses_events after insert on baptista.expenses
  for each row execute function baptista.tg_emit_expense_events();

-- C1: the shopping of a «Tutto in dispensa» becomes one expense in «Spesa alimentare». The total
-- is typed by the user; product lines only carry amounts the user typed (nothing invented).
create function baptista.register_shopping_expense(
  p_household_id uuid, p_batch_id uuid, p_total numeric, p_currency text, p_occurred_on date,
  p_merchant text, p_visibility text, p_lines jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat uuid;
  eid uuid;
begin
  perform baptista.require_uid();
  if not baptista.is_active_member(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_visibility not in ('private', 'household') or jsonb_typeof(coalesce(p_lines, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('baptista.shopping:' || p_household_id, 0));
  if not exists (select 1 from baptista.shopping_items
                  where household_id = p_household_id and stock_batch_id = p_batch_id
                    and status = 'stocked' and expense_id is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform baptista.ensure_expense_categories(p_household_id);
  select id into cat from baptista.expense_categories
   where household_id = p_household_id and lower(name) = 'spesa alimentare';
  insert into baptista.expenses (household_id, visibility, merchant, description, occurred_on, currency, total, category_id)
  values (p_household_id, p_visibility, nullif(btrim(p_merchant), ''), 'Spesa del ' || to_char(p_occurred_on, 'DD/MM/YYYY'),
          p_occurred_on, p_currency, p_total, cat)
  returning id into eid;
  insert into baptista.expense_items (household_id, expense_id, position, description, quantity, line_total, category_id)
  select p_household_id, eid, (row_number() over (order by s.sort_order, s.created_at))::integer, s.name, s.quantity,
         baptista.json_number(p_lines -> s.id::text), cat
    from baptista.shopping_items s
   where s.household_id = p_household_id and s.stock_batch_id = p_batch_id and s.status = 'stocked'
     and baptista.json_number(p_lines -> s.id::text) is not null;
  update baptista.shopping_items set expense_id = eid
   where household_id = p_household_id and stock_batch_id = p_batch_id and status = 'stocked';
  return eid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wardrobe → Spese (A-2): how a piece of clothing arrived, and its expense.
-- ---------------------------------------------------------------------------

alter table baptista.wardrobe_items
  add column acquisition text not null default 'unknown'
    check (acquisition in ('unknown', 'purchased', 'gift', 'owned_before')),
  add column expense_id uuid,
  add constraint wardrobe_items_expense_fk foreign key (household_id, expense_id)
    references baptista.expenses (household_id, id) on delete set null (expense_id);
create index wardrobe_items_expense_idx on baptista.wardrobe_items (expense_id) where expense_id is not null;

-- A linked expense must be readable by whoever links it (RLS of the session decides); a linked
-- item is a purchase by definition.
create function baptista.tg_wardrobe_expense()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.expense_id is not null and (tg_op = 'INSERT' or new.expense_id is distinct from old.expense_id) then
    if not exists (select 1 from baptista.expenses e where e.id = new.expense_id and e.household_id = new.household_id) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    new.acquisition := 'purchased';
  end if;
  return new;
end;
$$;
create trigger wardrobe_items_expense before insert or update on baptista.wardrobe_items
  for each row execute function baptista.tg_wardrobe_expense();

create function baptista.tg_emit_wardrobe_acquisition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.acquisition is distinct from old.acquisition then
    perform baptista.emit_event(new.household_id, 'wardrobe.acquisition_set', 'wardrobe_item', new.id,
      new.visibility, new.owner_user_id, jsonb_build_object('acquisition', new.acquisition),
      'wardrobe.acquisition_set:' || new.id || ':' || new.version);
  end if;
  return null;
end;
$$;
create trigger wardrobe_items_acquisition after update on baptista.wardrobe_items
  for each row execute function baptista.tg_emit_wardrobe_acquisition();

-- «Sì, l'ho comprato»: with a price, one expense in «Abbigliamento» linked to the item; without a
-- price the item is a purchase and no amount is invented. Caller's privileges (RLS applies).
create function baptista.register_wardrobe_purchase(
  p_item_id uuid, p_version integer, p_price numeric, p_currency text, p_occurred_on date,
  p_merchant text, p_visibility text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  it record;
  cat uuid;
  eid uuid;
  tz text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select id, household_id, version, name, brand, visibility, acquisition, expense_id into it
    from baptista.wardrobe_items where id = p_item_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if it.version <> p_version then
    raise exception 'conflict' using errcode = '40001';
  end if;
  if it.expense_id is not null then
    return it.expense_id; -- already registered (replay)
  end if;
  if p_price is not null then
    select timezone into tz from baptista.households where id = it.household_id;
    perform baptista.ensure_expense_categories(it.household_id);
    select id into cat from baptista.expense_categories
     where household_id = it.household_id and lower(name) = 'abbigliamento';
    insert into baptista.expenses (household_id, visibility, merchant, description, occurred_on, currency, total, category_id)
    values (it.household_id, coalesce(p_visibility, it.visibility), nullif(btrim(p_merchant), ''),
            left(it.name || coalesce(' · ' || it.brand, ''), 200),
            coalesce(p_occurred_on, (now() at time zone tz)::date), p_currency, p_price, cat)
    returning id into eid;
  end if;
  update baptista.wardrobe_items set acquisition = 'purchased', expense_id = eid where id = p_item_id;
  return eid;
end;
$$;

-- «Erano già miei» in bulk: at least 7 of the caller's unanswered items (server-side rule, the UI
-- check is only a convenience). All or nothing.
create function baptista.mark_wardrobe_owned_before(p_household_id uuid, p_ids uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wanted integer;
  updated integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select count(distinct x) into wanted from unnest(p_ids) x;
  if wanted < 7 then
    raise exception 'too_few' using errcode = '22023';
  end if;
  if wanted > 500 then
    raise exception 'invalid' using errcode = '22023';
  end if;
  update baptista.wardrobe_items
     set acquisition = 'owned_before'
   where household_id = p_household_id and id = any (p_ids) and owner_user_id = uid
     and acquisition = 'unknown' and status = 'active';
  get diagnostics updated = row_count;
  if updated <> wanted then
    raise exception 'conflict' using errcode = '40001';
  end if;
  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staple products (C8): always an explicit choice; a «No» to the suggestion is remembered.
-- ---------------------------------------------------------------------------

create table baptista.pantry_staples (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  name_key text generated always as (baptista.name_key(name)) stored,
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  status text not null default 'staple' check (status in ('staple', 'declined')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (household_id, name_key)
);

-- Star «Abituale» or «No, non chiederlo più»: one row per product name key, the latest answer wins.
-- Caller's privileges (RLS applies).
create function baptista.set_pantry_staple(p_household_id uuid, p_name text, p_barcode text, p_status text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into baptista.pantry_staples as ps (household_id, name, barcode, status)
  values (p_household_id, btrim(p_name), p_barcode, p_status)
  on conflict (household_id, name_key) do update
     set status = excluded.status,
         barcode = coalesce(excluded.barcode, ps.barcode);
end;
$$;

create function baptista.tg_emit_staple_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;
  perform baptista.emit_event(r.household_id, 'pantry.staple_changed', 'pantry_staple', r.id, 'household', null,
    jsonb_build_object('status', case when tg_op = 'DELETE' then 'removed' else r.status end),
    'pantry.staple_changed:' || r.id || ':' || gen_random_uuid());
  return null;
end;
$$;
create trigger pantry_staples_events after insert or update or delete on baptista.pantry_staples
  for each row execute function baptista.tg_emit_staple_events();

-- Shopping rows emit an event when added or closed by hand, so the next refresh (not throttled
-- after new events) resolves questions such as «Lo aggiungo alla lista?» right away.
create function baptista.tg_emit_shopping_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform baptista.emit_event(new.household_id, 'shopping.item_added', 'shopping_item', new.id, 'household',
      new.owner_user_id, jsonb_build_object('kind', new.kind), 'shopping.item_added:' || new.id);
  elsif new.status is distinct from old.status and new.status in ('done', 'removed') then
    perform baptista.emit_event(new.household_id, 'shopping.item_' || new.status, 'shopping_item', new.id, 'household',
      new.owner_user_id, '{}'::jsonb, 'shopping.item_' || new.status || ':' || new.id || ':' || new.version);
  end if;
  return null;
end;
$$;
create trigger shopping_items_events after insert or update on baptista.shopping_items
  for each row execute function baptista.tg_emit_shopping_events();

-- In the house: an available/opened food with the same barcode, or else the same name key.
create function baptista.in_pantry(p_household_id uuid, p_key text, p_barcode text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from baptista.food_items f
     where f.household_id = p_household_id and f.status in ('available', 'opened')
       and ((p_barcode is not null and f.barcode = p_barcode) or baptista.name_key(f.product_name) = p_key));
$$;

create function baptista.on_shopping_list(p_household_id uuid, p_key text, p_barcode text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from baptista.shopping_items s
     where s.household_id = p_household_id and s.status = 'open' and s.kind = 'food'
       and ((p_barcode is not null and s.barcode = p_barcode) or s.name_key = p_key));
$$;

-- ---------------------------------------------------------------------------
-- C9: a goal linked to a habit counts the habit's entries from the goal's creation day to its
-- target date. One source only: a linked goal refuses manual progress.
-- ---------------------------------------------------------------------------

alter table baptista.goals
  add column habit_id uuid,
  add constraint goals_habit_fk foreign key (household_id, habit_id)
    references baptista.habits (household_id, id) on delete set null (habit_id);
create index goals_habit_idx on baptista.goals (habit_id) where habit_id is not null;

create function baptista.habit_goal_count(p_habit_id uuid, p_since timestamptz, p_until date)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from baptista.habit_entries e
    join baptista.households hh on hh.id = e.household_id
   where e.habit_id = p_habit_id
     and e.performed_on >= (p_since at time zone hh.timezone)::date
     and (p_until is null or e.performed_on <= p_until);
$$;

-- Caller's privileges: the habit must be readable by whoever links it, and a shared goal cannot
-- follow a private habit (its count would leak).
create function baptista.tg_goal_habit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  h record;
begin
  if new.habit_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' or new.habit_id is distinct from old.habit_id or new.visibility is distinct from old.visibility then
    select visibility into h from baptista.habits where id = new.habit_id and household_id = new.household_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if new.visibility = 'household' and h.visibility = 'private' then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    new.start_value := 0;
    new.current_value := baptista.habit_goal_count(new.habit_id, coalesce(new.created_at, now()), new.target_date);
  elsif new.current_value <> old.current_value and current_user = 'authenticated' then
    raise exception 'linked_goal' using errcode = '22023';
  elsif new.target_date is distinct from old.target_date then
    new.current_value := baptista.habit_goal_count(new.habit_id, new.created_at, new.target_date);
  end if;
  return new;
end;
$$;
create trigger goals_habit_link before insert or update on baptista.goals
  for each row execute function baptista.tg_goal_habit();

create function baptista.tg_habit_goal_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  if tg_op = 'DELETE' then
    hid := old.habit_id;
  else
    hid := new.habit_id;
  end if;
  update baptista.goals g
     set current_value = baptista.habit_goal_count(g.habit_id, g.created_at, g.target_date)
   where g.habit_id = hid
     and g.current_value <> baptista.habit_goal_count(g.habit_id, g.created_at, g.target_date);
  return null;
end;
$$;
create trigger habit_entries_goal_sync after insert or delete on baptista.habit_entries
  for each row execute function baptista.tg_habit_goal_sync();

-- ---------------------------------------------------------------------------
-- Refresh: still throttled (30 s), except when new events arrived since the last refresh, so a
-- question born from a gesture appears (and an answered one disappears) right away.
-- ---------------------------------------------------------------------------

create or replace function baptista.refresh_observations(p_household_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_at timestamptz;
begin
  perform baptista.require_uid();
  if not baptista.is_active_member(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('baptista.refresh:' || p_household_id, 0));
  select refreshed_at into last_at from baptista.observation_refreshes where household_id = p_household_id;
  if last_at is not null and last_at > now() - interval '30 seconds'
     and not exists (select 1 from baptista.events v where v.household_id = p_household_id and v.occurred_at > last_at) then
    return false;
  end if;
  perform baptista._refresh_observations(p_household_id, now());
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Detectors v4: v3 + connection questions (A-2, C1, C2, C4, C5, C6, C8) and B-7
-- (calendar_overlap, food_opened). Questions have the actor as audience; budget and staples
-- belong to the household. Texts are Italian facts; Baptista's voice is applied in the app.
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
           jsonb_build_object('name', f.product_name, 'barcode', f.barcode, 'status', f.status)
      from baptista.food_items f
      join lateral (
        select v.actor_user_id from baptista.events v
         where v.source_id = f.id and v.event_type in ('food.item_consumed', 'food.item_discarded')
         order by v.occurred_at desc limit 1
      ) ev on ev.actor_user_id is not null
     where f.household_id = p_household_id and f.status in ('consumed', 'discarded')
       and f.closed_at > p_now - interval '3 days'
       and not baptista.in_pantry(p_household_id, baptista.name_key(f.product_name), f.barcode)
       and not baptista.on_shopping_list(p_household_id, baptista.name_key(f.product_name), f.barcode)
       and not exists (select 1 from baptista.pantry_staples ps
                        where ps.household_id = p_household_id and ps.status = 'staple'
                          and (ps.name_key = baptista.name_key(f.product_name) or (f.barcode is not null and ps.barcode = f.barcode)))
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
           'staple_candidate', md5(p_household_id::text || ':staple:' || x.key)::uuid, 'staple_suggestion:' || x.key,
           'household', null::uuid,
           0.2, 0.3, 1, 0.6,
           null::timestamptz,
           jsonb_build_object('name', x.name, 'barcode', x.barcode, 'count', x.n)
      from (
        select s.name_key as key, min(s.name) as name, max(s.barcode) as barcode, count(*)::integer as n
          from baptista.shopping_items s
         where s.household_id = p_household_id and s.status = 'stocked' and s.stocked_at > p_now - interval '60 days'
         group by s.name_key
        having count(*) >= 3
      ) x
     where not exists (select 1 from baptista.pantry_staples ps where ps.household_id = p_household_id and ps.name_key = x.key)
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
        select count(*)::integer as n, array_agg(ps.name order by ps.name) as names,
               md5(string_agg(ps.name_key, '|' order by ps.name_key)) as signature,
               jsonb_agg(jsonb_build_object('id', ps.id, 'name', ps.name, 'barcode', ps.barcode) order by ps.name) as items
          from baptista.pantry_staples ps
         where ps.household_id = p_household_id and ps.status = 'staple'
           and not baptista.in_pantry(p_household_id, ps.name_key, ps.barcode)
           and not baptista.on_shopping_list(p_household_id, ps.name_key, ps.barcode)
      ) m
     where m.n > 0
  )
  insert into baptista.observations as o (
    household_id, type, title, description, source_type, source_id, detector_version, dedupe_key,
    visibility, owner_user_id, urgency, importance, confidence, actionability, priority_score,
    ranking_version, state, data, valid_until, last_seen_at
  )
  select p_household_id, c.type, c.title, c.description, c.source_type, c.source_id, 4, c.dedupe_key,
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

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table baptista.shopping_items enable row level security;
create policy shopping_items_select on baptista.shopping_items for select to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));
create policy shopping_items_insert on baptista.shopping_items for insert to authenticated
  with check (owner_user_id = (select auth.uid()) and baptista.can_access(household_id, owner_user_id, visibility));
create policy shopping_items_update on baptista.shopping_items for update to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility))
  with check (baptista.can_access(household_id, owner_user_id, visibility));
create policy shopping_items_delete on baptista.shopping_items for delete to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));

alter table baptista.pantry_staples enable row level security;
create policy pantry_staples_select on baptista.pantry_staples for select to authenticated
  using (baptista.is_active_member(household_id));
create policy pantry_staples_insert on baptista.pantry_staples for insert to authenticated
  with check (baptista.is_active_member(household_id));
create policy pantry_staples_update on baptista.pantry_staples for update to authenticated
  using (baptista.is_active_member(household_id)) with check (baptista.is_active_member(household_id));
create policy pantry_staples_delete on baptista.pantry_staples for delete to authenticated
  using (baptista.is_active_member(household_id));

revoke all on baptista.shopping_items, baptista.pantry_staples from public, anon, authenticated;
grant select, delete on baptista.shopping_items, baptista.pantry_staples to authenticated;
grant insert (household_id, kind, name, quantity, unit, brand, barcode, category, kcal_100g, protein_100g, carbs_100g,
              fat_100g, storage, sort_order),
      update (name, quantity, unit, storage, status, sort_order)
  on baptista.shopping_items to authenticated;
grant insert (household_id, name, barcode, status), update (barcode, status) on baptista.pantry_staples to authenticated;
grant insert (acquisition, expense_id), update (acquisition, expense_id) on baptista.wardrobe_items to authenticated;
grant insert (habit_id), update (habit_id) on baptista.goals to authenticated;
grant all on baptista.shopping_items, baptista.pantry_staples to service_role;

revoke execute on function
  baptista.name_key(text),
  baptista.tg_shopping_guard(),
  baptista.add_shopping_item(uuid, text, text, numeric, text, text, text, text, text, numeric, numeric, numeric, numeric),
  baptista.stock_shopping_items(uuid, uuid[], boolean),
  baptista.unstock_shopping_items(uuid, uuid[]),
  baptista.tg_emit_expense_events(),
  baptista.register_shopping_expense(uuid, uuid, numeric, text, date, text, text, jsonb),
  baptista.tg_wardrobe_expense(),
  baptista.tg_emit_wardrobe_acquisition(),
  baptista.register_wardrobe_purchase(uuid, integer, numeric, text, date, text, text),
  baptista.mark_wardrobe_owned_before(uuid, uuid[]),
  baptista.set_pantry_staple(uuid, text, text, text),
  baptista.tg_emit_staple_events(),
  baptista.tg_emit_shopping_events(),
  baptista.in_pantry(uuid, text, text),
  baptista.on_shopping_list(uuid, text, text),
  baptista.habit_goal_count(uuid, timestamptz, date),
  baptista.tg_goal_habit(),
  baptista.tg_habit_goal_sync()
from public, anon;
revoke execute on function
  baptista.tg_emit_expense_events(),
  baptista.tg_emit_wardrobe_acquisition(),
  baptista.tg_emit_staple_events(),
  baptista.tg_emit_shopping_events(),
  baptista.in_pantry(uuid, text, text),
  baptista.on_shopping_list(uuid, text, text),
  baptista.tg_habit_goal_sync()
from authenticated;
grant execute on function
  baptista.name_key(text),
  baptista.add_shopping_item(uuid, text, text, numeric, text, text, text, text, text, numeric, numeric, numeric, numeric),
  baptista.stock_shopping_items(uuid, uuid[], boolean),
  baptista.unstock_shopping_items(uuid, uuid[]),
  baptista.register_shopping_expense(uuid, uuid, numeric, text, date, text, text, jsonb),
  baptista.register_wardrobe_purchase(uuid, integer, numeric, text, date, text, text),
  baptista.mark_wardrobe_owned_before(uuid, uuid[]),
  baptista.set_pantry_staple(uuid, text, text, text),
  baptista.habit_goal_count(uuid, timestamptz, date)
to authenticated;
grant execute on all functions in schema baptista to service_role;
