-- Phase 04 — Cucina (decision D25): food inventory with expiry and nutrition data, recipes
-- (notes of kind 'recipe': ingredient list + free text), meals (combos of foods with macros) and a
-- private calorie diary. Food detectors expiringFood/oldFood join the deterministic refresh.
-- docs/architecture/DATABASE.md (food), AGENT.md (detector windows), SECURITY.md (visibility).

-- ---------------------------------------------------------------------------
-- Food inventory
-- ---------------------------------------------------------------------------

create table baptista.food_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  product_name text not null check (char_length(btrim(product_name)) between 1 and 120),
  brand text check (brand is null or char_length(brand) <= 80),
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  category text not null default 'other'
    check (category in ('produce', 'dairy', 'meat_fish', 'bakery', 'ready_meal', 'pantry', 'frozen', 'drinks', 'other')),
  quantity numeric(12, 3) not null default 1 check (quantity >= 0 and quantity <= 999999),
  unit text not null default 'pz' check (unit in ('pz', 'g', 'kg', 'ml', 'l', 'conf')),
  storage text not null default 'fridge' check (storage in ('fridge', 'freezer', 'pantry')),
  status text not null default 'available' check (status in ('available', 'opened', 'consumed', 'discarded')),
  purchased_on date,
  opened_on date,
  -- An explicit date (printed on the package) always wins over an estimate; both are kept.
  explicit_expires_on date,
  estimated_expires_on date,
  estimate_basis text check (estimate_basis is null or char_length(estimate_basis) <= 120),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  -- Nutrition per 100 g/ml (Open Food Facts or typed by hand).
  kcal_100g numeric(7, 2) check (kcal_100g is null or kcal_100g between 0 and 1000),
  protein_100g numeric(6, 2) check (protein_100g is null or protein_100g between 0 and 100),
  carbs_100g numeric(6, 2) check (carbs_100g is null or carbs_100g between 0 and 100),
  fat_100g numeric(6, 2) check (fat_100g is null or fat_100g between 0 and 100),
  nutrition_source text check (nutrition_source is null or nutrition_source in ('manual', 'openfoodfacts')),
  closed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check ((status in ('consumed', 'discarded')) = (closed_at is not null)),
  check (estimated_expires_on is null or estimate_basis is not null)
);
create index food_items_open_idx on baptista.food_items (household_id, storage, status)
  where status in ('available', 'opened');

create function baptista.tg_food_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('consumed', 'discarded') then
    if tg_op = 'INSERT' then
      new.closed_at := now();
    elsif old.status is distinct from new.status or new.closed_at is null then
      new.closed_at := now();
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recipes are notes: an ingredient checklist plus free text (user decision D25).
-- ---------------------------------------------------------------------------

alter table baptista.notes drop constraint notes_kind_check;
alter table baptista.notes add constraint notes_kind_check check (kind in ('note', 'list', 'recipe'));

-- ---------------------------------------------------------------------------
-- Meals: a saved combination of foods with grams and nutrition per 100 g.
-- Totals are derived (lib/nutrition.ts), never stored twice.
-- ---------------------------------------------------------------------------

-- JSON validators: a missing key yields NULL, so every element predicate is wrapped in
-- coalesce(…, false) and numbers are only cast after their type was checked.
create function baptista.json_number(p_value jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$ select case when jsonb_typeof(p_value) = 'number' then (p_value #>> '{}')::numeric end $$;

create function baptista.valid_meal_items(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_items) = 'array'
     and jsonb_array_length(p_items) <= 50
     and not exists (
       select 1 from jsonb_array_elements(p_items) e
        where not coalesce(
          jsonb_typeof(e) = 'object'
          and jsonb_typeof(e -> 'id') = 'string'
          and jsonb_typeof(e -> 'name') = 'string'
          and char_length(e ->> 'name') between 1 and 120
          and baptista.json_number(e -> 'grams') > 0 and baptista.json_number(e -> 'grams') <= 5000
          and baptista.json_number(e -> 'kcal_100g') between 0 and 1000
          and coalesce(jsonb_typeof(e -> 'protein_100g'), 'null') in ('number', 'null')
          and coalesce(jsonb_typeof(e -> 'carbs_100g'), 'null') in ('number', 'null')
          and coalesce(jsonb_typeof(e -> 'fat_100g'), 'null') in ('number', 'null')
          and coalesce(baptista.json_number(e -> 'protein_100g'), 0) between 0 and 100
          and coalesce(baptista.json_number(e -> 'carbs_100g'), 0) between 0 and 100
          and coalesce(baptista.json_number(e -> 'fat_100g'), 0) between 0 and 100,
          false)
     );
$$;

-- Same NULL hole in the Phase 03 checklist validator (an item without "id" or "done" was
-- accepted). Existing rows were all written by the app with complete items.
create or replace function baptista.valid_checklist(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_items) = 'array'
     and jsonb_array_length(p_items) <= 200
     and not exists (
       select 1 from jsonb_array_elements(p_items) e
        where not coalesce(
          jsonb_typeof(e) = 'object'
          and jsonb_typeof(e -> 'id') = 'string'
          and jsonb_typeof(e -> 'text') = 'string'
          and char_length(e ->> 'text') between 1 and 200
          and jsonb_typeof(e -> 'done') = 'boolean',
          false)
     );
$$;

create table baptista.meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  items jsonb not null default '[]'::jsonb check (baptista.valid_meal_items(items)),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create index meals_household_idx on baptista.meals (household_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Calorie diary: always private to its owner. Values are a snapshot of what was eaten, so
-- deleting a meal or consuming a food never rewrites the diary.
-- ---------------------------------------------------------------------------

create table baptista.diet_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'private' check (visibility = 'private'),
  eaten_on date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  grams numeric(7, 1) check (grams is null or (grams > 0 and grams <= 10000)),
  kcal numeric(7, 1) not null check (kcal between 0 and 20000),
  protein_g numeric(6, 1) check (protein_g is null or protein_g between 0 and 2000),
  carbs_g numeric(6, 1) check (carbs_g is null or carbs_g between 0 and 2000),
  fat_g numeric(6, 1) check (fat_g is null or fat_g between 0 and 2000),
  meal_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, meal_id) references baptista.meals (household_id, id) on delete set null (meal_id)
);
create index diet_entries_owner_day_idx on baptista.diet_entries (owner_user_id, eaten_on);

-- Personal daily calorie target (self-only profile data).
alter table baptista.profiles
  add column kcal_target integer check (kcal_target is null or kcal_target between 800 and 6000);
grant update (kcal_target) on baptista.profiles to authenticated;

-- Record triggers ------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['food_items', 'meals', 'diet_entries'] loop
    execute format('create trigger %1$s_insert before insert on baptista.%1$s
                      for each row execute function baptista.tg_record_insert()', t);
    execute format('create trigger %1$s_guard before update on baptista.%1$s
                      for each row execute function baptista.tg_record_update()', t);
    execute format('create trigger %1$s_touch before update on baptista.%1$s
                      for each row execute function baptista.tg_touch()', t);
  end loop;
  foreach t in array array['food_items', 'meals'] loop
    execute format('create trigger %1$s_derived after update or delete on baptista.%1$s
                      for each row execute function baptista.tg_record_derived()', t);
  end loop;
end;
$$;

create trigger food_items_status before insert or update on baptista.food_items
  for each row execute function baptista.tg_food_status();

-- Events: food.item_added / item_consumed / item_discarded, same transaction (D17).
create function baptista.tg_emit_food_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform baptista.emit_event(new.household_id, 'food.item_added', 'food_item', new.id,
      new.visibility, new.owner_user_id, jsonb_build_object('storage', new.storage),
      'food.item_added:' || new.id);
  elsif new.status is distinct from old.status and new.status in ('consumed', 'discarded') then
    perform baptista.emit_event(new.household_id,
      case new.status when 'consumed' then 'food.item_consumed' else 'food.item_discarded' end,
      'food_item', new.id, new.visibility, new.owner_user_id, '{}'::jsonb,
      'food.item_' || new.status || ':' || new.id || ':' || new.version);
  end if;
  return null;
end;
$$;

create trigger food_items_events after insert or update on baptista.food_items
  for each row execute function baptista.tg_emit_food_events();

-- ---------------------------------------------------------------------------
-- Detectors v3: + expiringFood and oldFood (AGENT.md windows). Food texts never claim safety;
-- estimates use cautious wording.
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
           jsonb_build_object('due_date', t.due_date, 'days_overdue', today - t.due_date)
      from baptista.tasks t
     where t.household_id = p_household_id and t.status = 'open' and t.due_date < today
    union all
    select 'missed_habit', h.title || ': ' || coalesce(c.n, 0) || ' su ' || h.target_per_week || ' registrate la settimana scorsa',
           'Conta solo le registrazioni. Se l''hai fatto senza registrarlo, puoi ancora aggiungerlo.',
           'habit', h.id, 'missed_habit:' || h.id || ':' || prev_week_start,
           h.visibility, h.owner_user_id,
           0.3, 0.4, 0.6, 0.3,
           week_end_at,
           jsonb_build_object('week_start', prev_week_start, 'logged', coalesce(c.n, 0), 'target', h.target_per_week)
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
                              'days_left', days_left)
      from baptista.habits h
      left join lateral (
        select count(*)::integer as n from baptista.habit_entries x
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
                              'unit', g.unit,
                              'percent', baptista.goal_percent(g.start_value, g.current_value, g.target_value))
      from baptista.goals g
      join lateral (
        select max(occurred_at) as occurred_at from baptista.events v
         where v.source_id = g.id and v.event_type = 'goal.progress_changed'
      ) ev on ev.occurred_at is not null and ev.occurred_at > p_now - interval '24 hours'
     where g.household_id = p_household_id
    union all
    -- expiringFood: effective date (explicit wins over estimate) within 2 days or already past.
    -- One observation per item and date: approaching -> today updates the same card.
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
                              'estimated', f.explicit_expires_on is null, 'storage', f.storage)
      from baptista.food_items f
      cross join lateral (select coalesce(f.explicit_expires_on, f.estimated_expires_on) as d) x
     where f.household_id = p_household_id and f.status in ('available', 'opened')
       and x.d is not null and x.d <= today + 2
    union all
    -- oldFood: fresh food in the fridge with no date at all, older than 7 days. A reminder to
    -- check, never a statement about food safety. Pantry/freezer are excluded (AGENT.md).
    select 'old_food',
           f.product_name || ': in frigo da ' || (today - x.since) || ' giorni',
           'Nessuna data registrata. È un promemoria per controllare, non un''indicazione sulla sicurezza.',
           'food_item', f.id, 'old_food:' || f.id,
           f.visibility, f.owner_user_id,
           0.4, 0.4, 0.5, 0.7,
           null::timestamptz,
           jsonb_build_object('days', today - x.since, 'estimated', true, 'storage', f.storage)
      from baptista.food_items f
      cross join lateral (select coalesce(f.purchased_on, (f.created_at at time zone tz)::date) as since) x
     where f.household_id = p_household_id and f.status in ('available', 'opened')
       and f.storage = 'fridge'
       and f.category in ('produce', 'dairy', 'meat_fish', 'bakery', 'ready_meal')
       and f.explicit_expires_on is null and f.estimated_expires_on is null
       and x.since <= today - 7
  )
  insert into baptista.observations as o (
    household_id, type, title, description, source_type, source_id, detector_version, dedupe_key,
    visibility, owner_user_id, urgency, importance, confidence, actionability, priority_score,
    ranking_version, state, data, valid_until, last_seen_at
  )
  select p_household_id, c.type, c.title, c.description, c.source_type, c.source_id, 3, c.dedupe_key,
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

do $$
declare
  t text;
begin
  foreach t in array array['food_items', 'meals', 'diet_entries'] loop
    execute format('alter table baptista.%s enable row level security', t);
    execute format('create policy %1$s_select on baptista.%1$s for select to authenticated
                      using (baptista.can_access(household_id, owner_user_id, visibility))', t);
    execute format('create policy %1$s_insert on baptista.%1$s for insert to authenticated
                      with check (owner_user_id = (select auth.uid())
                                  and baptista.can_access(household_id, owner_user_id, visibility))', t);
    execute format('create policy %1$s_update on baptista.%1$s for update to authenticated
                      using (baptista.can_access(household_id, owner_user_id, visibility))
                      with check (baptista.can_access(household_id, owner_user_id, visibility))', t);
    execute format('create policy %1$s_delete on baptista.%1$s for delete to authenticated
                      using (baptista.can_access(household_id, owner_user_id, visibility))', t);
  end loop;
end;
$$;

revoke all on baptista.food_items, baptista.meals, baptista.diet_entries from public, anon, authenticated;
grant select, delete on baptista.food_items, baptista.meals, baptista.diet_entries to authenticated;

grant insert (household_id, visibility, product_name, brand, barcode, category, quantity, unit, storage, status,
              purchased_on, opened_on, explicit_expires_on, estimated_expires_on, estimate_basis,
              kcal_100g, protein_100g, carbs_100g, fat_100g, nutrition_source),
      update (visibility, product_name, brand, barcode, category, quantity, unit, storage, status,
              purchased_on, opened_on, explicit_expires_on, estimated_expires_on, estimate_basis,
              kcal_100g, protein_100g, carbs_100g, fat_100g, nutrition_source)
  on baptista.food_items to authenticated;
grant insert (household_id, visibility, title, notes, items), update (visibility, title, notes, items)
  on baptista.meals to authenticated;
grant insert (household_id, eaten_on, slot, label, grams, kcal, protein_g, carbs_g, fat_g, meal_id),
      update (eaten_on, slot, label, grams, kcal, protein_g, carbs_g, fat_g)
  on baptista.diet_entries to authenticated;

grant all on baptista.food_items, baptista.meals, baptista.diet_entries to service_role;

revoke execute on function
  baptista.tg_food_status(),
  baptista.json_number(jsonb),
  baptista.valid_meal_items(jsonb),
  baptista.tg_emit_food_events(),
  baptista._refresh_observations(uuid, timestamptz)
from public, anon;
revoke execute on function baptista.tg_emit_food_events(), baptista._refresh_observations(uuid, timestamptz)
  from authenticated;
grant execute on function baptista.json_number(jsonb), baptista.valid_meal_items(jsonb) to authenticated;
grant execute on all functions in schema baptista to service_role;
