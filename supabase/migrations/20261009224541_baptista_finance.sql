-- Phase 04 — Finanze (decision D26): expense categories (household, idempotent bootstrap),
-- expenses with optional lines, monthly budgets, spending goals with a revisable estimate
-- ("preventivo") and a personal watchlist of securities.
-- Amounts are numeric in an ISO currency; nothing ever sums different currencies (DATABASE.md).

create function baptista.is_currency(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_value ~ '^[A-Z]{3}$' $$;

-- ---------------------------------------------------------------------------
-- Expense categories: shared by the household, unique by name (case-insensitive).
-- ---------------------------------------------------------------------------

create table baptista.expense_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  parent_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check (parent_id is null or parent_id <> id),
  foreign key (household_id, parent_id) references baptista.expense_categories (household_id, id)
    on delete set null (parent_id)
);
create unique index expense_categories_name_idx on baptista.expense_categories (household_id, lower(name));

create function baptista.tg_expense_category_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.color := lower(new.color);
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' and (new.household_id <> old.household_id or new.created_by is distinct from old.created_by) then
    raise exception 'immutable_field' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger expense_categories_write before insert or update on baptista.expense_categories
  for each row execute function baptista.tg_expense_category_write();
create trigger expense_categories_touch before update on baptista.expense_categories
  for each row execute function baptista.tg_touch();

-- Idempotent bootstrap of the default categories (Italian product language). Runs with the
-- caller's privileges: RLS decides whether the caller may write in that household.
create function baptista.ensure_expense_categories(p_household_id uuid)
returns void
language sql
set search_path = ''
as $$
  insert into baptista.expense_categories (household_id, name, color)
  select p_household_id, v.name, v.color
    from (values
      ('Spesa alimentare', '#6aa04f'),
      ('Casa', '#8a6d4f'),
      ('Bollette', '#4f8fd6'),
      ('Trasporti', '#2f7f9f'),
      ('Salute', '#e0795b'),
      ('Ristoranti', '#d9a33a'),
      ('Svago', '#e6a23c'),
      ('Abbigliamento', '#7a6fd0'),
      ('Viaggi', '#3f9d8c'),
      ('Altro', '#8f8a80')
    ) as v (name, color)
  on conflict (household_id, lower(name)) do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Spending goals: a project (holiday, renovation…) with an estimate made of lines that can be
-- revised over time. The first estimate is kept to show how it changed.
-- ---------------------------------------------------------------------------

create function baptista.valid_estimate_lines(p_lines jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_lines) = 'array'
     and jsonb_array_length(p_lines) <= 100
     and not exists (
       select 1 from jsonb_array_elements(p_lines) e
        where not coalesce(
          jsonb_typeof(e) = 'object'
          and jsonb_typeof(e -> 'id') = 'string'
          and jsonb_typeof(e -> 'label') = 'string'
          and char_length(e ->> 'label') between 1 and 120
          and baptista.json_number(e -> 'amount') between 0 and 999999999,
          false)
     );
$$;

create function baptista.estimate_total(p_lines jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(round(sum((e ->> 'amount')::numeric), 2), 0)
    from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) e;
$$;

create table baptista.finance_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  currency text not null default 'EUR' check (baptista.is_currency(currency)),
  target_date date,
  estimate_lines jsonb not null default '[]'::jsonb check (baptista.valid_estimate_lines(estimate_lines)),
  initial_estimate numeric(14, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create index finance_goals_household_idx on baptista.finance_goals (household_id, status, created_at);

create function baptista.tg_finance_goal_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.initial_estimate := baptista.estimate_total(new.estimate_lines);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expenses and lines. `total` is the confirmed document total; lines are detail and never
-- forced to match it (a discrepancy is shown for review).
-- ---------------------------------------------------------------------------

create table baptista.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  merchant text check (merchant is null or char_length(btrim(merchant)) between 1 and 120),
  description text check (description is null or char_length(btrim(description)) between 1 and 200),
  occurred_on date not null,
  currency text not null check (baptista.is_currency(currency)),
  subtotal numeric(14, 2) check (subtotal is null or subtotal >= 0),
  tax numeric(14, 2) check (tax is null or tax >= 0),
  discount numeric(14, 2) check (discount is null or discount >= 0),
  total numeric(14, 2) not null check (total >= 0 and total <= 999999999),
  payment_method text check (payment_method is null or payment_method in ('cash', 'card', 'transfer', 'other')),
  category_id uuid,
  goal_id uuid,
  -- Set by receipt intake confirmation (visual_intakes arrives with the vision pipeline).
  receipt_intake_id uuid unique,
  notes text check (notes is null or char_length(notes) <= 2000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check (merchant is not null or description is not null),
  foreign key (household_id, category_id) references baptista.expense_categories (household_id, id)
    on delete set null (category_id),
  foreign key (household_id, goal_id) references baptista.finance_goals (household_id, id)
    on delete set null (goal_id)
);
create index expenses_household_day_idx on baptista.expenses (household_id, occurred_on desc);
create index expenses_goal_idx on baptista.expenses (goal_id) where goal_id is not null;

create table baptista.expense_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  expense_id uuid not null,
  position integer not null default 0 check (position between 0 and 1000),
  raw_description text check (raw_description is null or char_length(raw_description) <= 200),
  description text not null check (char_length(btrim(description)) between 1 and 200),
  quantity numeric(12, 3) check (quantity is null or (quantity > 0 and quantity <= 999999)),
  unit_price numeric(14, 2) check (unit_price is null or unit_price between -999999999 and 999999999),
  -- Discount lines can be negative.
  line_total numeric(14, 2) not null check (line_total between -999999999 and 999999999),
  category_id uuid,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default now(),
  foreign key (household_id, expense_id) references baptista.expenses (household_id, id) on delete cascade,
  foreign key (household_id, category_id) references baptista.expense_categories (household_id, id)
    on delete set null (category_id)
);
create index expense_items_expense_idx on baptista.expense_items (expense_id, position);

-- ---------------------------------------------------------------------------
-- Monthly budgets: one per category and currency, plus an optional overall one (category null).
-- ---------------------------------------------------------------------------

create table baptista.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  category_id uuid,
  currency text not null default 'EUR' check (baptista.is_currency(currency)),
  monthly_amount numeric(14, 2) not null check (monthly_amount > 0 and monthly_amount <= 999999999),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, category_id) references baptista.expense_categories (household_id, id)
    on delete cascade
);
create unique index budgets_scope_idx on baptista.budgets
  (household_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), currency);

create function baptista.tg_budget_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' and (new.household_id <> old.household_id or new.created_by is distinct from old.created_by) then
    raise exception 'immutable_field' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger budgets_write before insert or update on baptista.budgets
  for each row execute function baptista.tg_budget_write();
create trigger budgets_touch before update on baptista.budgets
  for each row execute function baptista.tg_touch();

-- ---------------------------------------------------------------------------
-- Watchlist: personal (per user, not per household), at most 30 symbols. Symbols are
-- TradingView-style tickers such as "NASDAQ:AAPL" or "MIL:ENI".
-- ---------------------------------------------------------------------------

create table baptista.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9][A-Z0-9._!:-]{0,39}$'),
  label text check (label is null or char_length(btrim(label)) between 1 and 60),
  position integer not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default now(),
  unique (owner_user_id, symbol)
);

create function baptista.tg_watchlist_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_user_id := auth.uid();
  end if;
  if (select count(*) from baptista.watchlist_items w where w.owner_user_id = new.owner_user_id) >= 30 then
    raise exception 'limit_reached' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger watchlist_items_insert before insert on baptista.watchlist_items
  for each row execute function baptista.tg_watchlist_insert();

-- Record triggers for the visibility-carrying tables ---------------------------

do $$
declare
  t text;
begin
  foreach t in array array['finance_goals', 'expenses'] loop
    execute format('create trigger %1$s_insert before insert on baptista.%1$s
                      for each row execute function baptista.tg_record_insert()', t);
    execute format('create trigger %1$s_guard before update on baptista.%1$s
                      for each row execute function baptista.tg_record_update()', t);
    execute format('create trigger %1$s_touch before update on baptista.%1$s
                      for each row execute function baptista.tg_touch()', t);
    execute format('create trigger %1$s_derived after update or delete on baptista.%1$s
                      for each row execute function baptista.tg_record_derived()', t);
  end loop;
end;
$$;

create trigger finance_goals_initial before insert on baptista.finance_goals
  for each row execute function baptista.tg_finance_goal_insert();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['finance_goals', 'expenses'] loop
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
  foreach t in array array['expense_categories', 'budgets'] loop
    execute format('alter table baptista.%s enable row level security', t);
    execute format('create policy %1$s_select on baptista.%1$s for select to authenticated
                      using (baptista.is_active_member(household_id))', t);
    execute format('create policy %1$s_insert on baptista.%1$s for insert to authenticated
                      with check (baptista.is_active_member(household_id))', t);
    execute format('create policy %1$s_update on baptista.%1$s for update to authenticated
                      using (baptista.is_active_member(household_id))
                      with check (baptista.is_active_member(household_id))', t);
    execute format('create policy %1$s_delete on baptista.%1$s for delete to authenticated
                      using (baptista.is_active_member(household_id))', t);
  end loop;
end;
$$;

-- Lines have no audience of their own: they follow the parent expense (read through its RLS).
alter table baptista.expense_items enable row level security;
create policy expense_items_select on baptista.expense_items for select to authenticated
  using (exists (select 1 from baptista.expenses e where e.id = expense_id and e.household_id = expense_items.household_id));
create policy expense_items_insert on baptista.expense_items for insert to authenticated
  with check (exists (select 1 from baptista.expenses e where e.id = expense_id and e.household_id = expense_items.household_id));
create policy expense_items_update on baptista.expense_items for update to authenticated
  using (exists (select 1 from baptista.expenses e where e.id = expense_id and e.household_id = expense_items.household_id))
  with check (exists (select 1 from baptista.expenses e where e.id = expense_id and e.household_id = expense_items.household_id));
create policy expense_items_delete on baptista.expense_items for delete to authenticated
  using (exists (select 1 from baptista.expenses e where e.id = expense_id and e.household_id = expense_items.household_id));

alter table baptista.watchlist_items enable row level security;
create policy watchlist_items_select on baptista.watchlist_items for select to authenticated
  using (owner_user_id = (select auth.uid()));
create policy watchlist_items_insert on baptista.watchlist_items for insert to authenticated
  with check (owner_user_id = (select auth.uid()));
create policy watchlist_items_update on baptista.watchlist_items for update to authenticated
  using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy watchlist_items_delete on baptista.watchlist_items for delete to authenticated
  using (owner_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants (identity columns never writable by clients)
-- ---------------------------------------------------------------------------

revoke all on
  baptista.expense_categories, baptista.finance_goals, baptista.expenses, baptista.expense_items,
  baptista.budgets, baptista.watchlist_items
from public, anon, authenticated;

grant select, delete on
  baptista.expense_categories, baptista.finance_goals, baptista.expenses, baptista.expense_items,
  baptista.budgets, baptista.watchlist_items
to authenticated;

grant insert (household_id, name, color, parent_id), update (name, color, parent_id)
  on baptista.expense_categories to authenticated;
grant insert (household_id, visibility, title, notes, currency, target_date, estimate_lines, status),
      update (visibility, title, notes, target_date, estimate_lines, status)
  on baptista.finance_goals to authenticated;
grant insert (household_id, visibility, merchant, description, occurred_on, currency, subtotal, tax, discount,
              total, payment_method, category_id, goal_id, notes),
      update (visibility, merchant, description, occurred_on, currency, subtotal, tax, discount,
              total, payment_method, category_id, goal_id, notes)
  on baptista.expenses to authenticated;
grant insert (household_id, expense_id, position, raw_description, description, quantity, unit_price, line_total, category_id),
      update (position, description, quantity, unit_price, line_total, category_id)
  on baptista.expense_items to authenticated;
grant insert (household_id, category_id, currency, monthly_amount), update (monthly_amount)
  on baptista.budgets to authenticated;
grant insert (symbol, label, position), update (label, position) on baptista.watchlist_items to authenticated;

grant all on
  baptista.expense_categories, baptista.finance_goals, baptista.expenses, baptista.expense_items,
  baptista.budgets, baptista.watchlist_items
to service_role;

revoke execute on function
  baptista.is_currency(text),
  baptista.tg_expense_category_write(),
  baptista.ensure_expense_categories(uuid),
  baptista.valid_estimate_lines(jsonb),
  baptista.estimate_total(jsonb),
  baptista.tg_finance_goal_insert(),
  baptista.tg_budget_write(),
  baptista.tg_watchlist_insert()
from public, anon;
grant execute on function
  baptista.is_currency(text),
  baptista.ensure_expense_categories(uuid),
  baptista.valid_estimate_lines(jsonb),
  baptista.estimate_total(jsonb)
to authenticated;
grant execute on all functions in schema baptista to service_role;
