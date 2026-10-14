-- Meal planner: food_id tracking on diet_entries, skip + materialization tables.
-- 2026-10-14

-- 1. Add food_id to diet_entries for recent-food tracking ----------------------

alter table baptista.diet_entries
  add column food_id uuid references baptista.foods(id) on delete set null;

grant insert (food_id), update (food_id) on baptista.diet_entries to authenticated;

create index diet_entries_food_idx on baptista.diet_entries (owner_user_id, food_id)
  where food_id is not null;

-- Index for efficient multi-day queries (weekly view).
create index diet_entries_owner_range on baptista.diet_entries (owner_user_id, eaten_on);

-- 2. Skips table: prevents re-materialization of deleted recurring entries ------

create table baptista.diet_entry_skips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  schedule_id uuid not null references baptista.meal_schedules(id) on delete cascade,
  skipped_on date not null,
  created_at timestamptz not null default now(),
  unique (owner_user_id, schedule_id, skipped_on)
);

alter table baptista.diet_entry_skips enable row level security;

create policy diet_entry_skips_select on baptista.diet_entry_skips for select to authenticated
  using (owner_user_id = auth.uid());
create policy diet_entry_skips_insert on baptista.diet_entry_skips for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy diet_entry_skips_delete on baptista.diet_entry_skips for delete to authenticated
  using (owner_user_id = auth.uid());

revoke all on baptista.diet_entry_skips from public, anon, authenticated;
grant select, delete on baptista.diet_entry_skips to authenticated;
grant insert (household_id, schedule_id, skipped_on)
  on baptista.diet_entry_skips to authenticated;
grant all on baptista.diet_entry_skips to service_role;

-- 3. Materializations: concurrency-safe marker that a schedule+day was handled -
--    PK prevents any concurrent request from materializing the same pair twice.

create table baptista.diet_materializations (
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  schedule_id uuid not null references baptista.meal_schedules(id) on delete cascade,
  materialized_on date not null,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, schedule_id, materialized_on)
);

alter table baptista.diet_materializations enable row level security;

create policy diet_mat_select on baptista.diet_materializations for select to authenticated
  using (owner_user_id = auth.uid());
create policy diet_mat_insert on baptista.diet_materializations for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy diet_mat_delete on baptista.diet_materializations for delete to authenticated
  using (owner_user_id = auth.uid());

revoke all on baptista.diet_materializations from public, anon, authenticated;
grant select, delete on baptista.diet_materializations to authenticated;
grant insert (schedule_id, materialized_on)
  on baptista.diet_materializations to authenticated;
grant all on baptista.diet_materializations to service_role;
