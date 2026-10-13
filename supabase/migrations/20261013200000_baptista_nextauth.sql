-- NextAuth migration: introduce baptista.users as the identity table, drop FK
-- constraints to auth.users so future users no longer need Supabase Auth rows.
-- UUIDs are preserved: all existing records stay linked.
--
-- The minted-JWT approach (jose HS256 signed with SUPABASE_JWT_SECRET) makes
-- auth.uid() return the correct UUID from baptista.users.id, so all existing
-- RLS policies, triggers and RPCs continue working unchanged.

-- ---------------------------------------------------------------------------
-- 1. baptista.users — canonical identity table
-- ---------------------------------------------------------------------------

create table baptista.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  household_id uuid references baptista.households (id) on delete set null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table baptista.users enable row level security;
-- Authenticated users can read their own row (needed for NextAuth authorize lookup via service_role,
-- and for the app to query user data after login).
create policy users_select_own on baptista.users
  for select to authenticated using (id = (select auth.uid()));

revoke all on baptista.users from public, anon;
grant select on baptista.users to authenticated;
grant all on baptista.users to service_role;

create trigger users_touch before update on baptista.users
  for each row execute function baptista.tg_touch();

-- ---------------------------------------------------------------------------
-- 2. Seed from existing data (preserving UUIDs)
-- ---------------------------------------------------------------------------

insert into baptista.users (id, email, display_name, avatar_path, household_id, role)
select u.id, lower(u.email), a.display_name, p.avatar_path, a.household_id, a.role
  from baptista.app_users a
  join auth.users u on lower(u.email) = a.email
  left join baptista.profiles p on p.user_id = u.id
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Update require_uid() to check baptista.users instead of auth.users
-- ---------------------------------------------------------------------------

create or replace function baptista.is_app_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from baptista.users where id = p_user_id
  );
$$;

-- Update invite_member to look up target user in baptista.users instead of auth.users
create or replace function baptista.invite_member(p_household_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := baptista.require_uid();
  target uuid;
  current_state text;
begin
  if not baptista.is_household_owner(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select u.id into target
    from baptista.users u
    join baptista.profiles p on p.user_id = u.id
   where lower(u.email) = lower(btrim(p_email));
  if target is null or target = uid then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;
  select state into current_state from baptista.household_members
   where household_id = p_household_id and user_id = target;
  if current_state in ('pending', 'active') then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  elsif current_state = 'revoked' then
    update baptista.household_members
       set state = 'pending', role = 'member', invited_by = uid, accepted_at = null, revoked_at = null
     where household_id = p_household_id and user_id = target;
  else
    insert into baptista.household_members (household_id, user_id, role, state, invited_by)
    values (p_household_id, target, 'member', 'pending', uid);
  end if;
end;
$$;

-- Update household_directory to join baptista.users instead of just profiles
create or replace function baptista.household_directory(p_household_id uuid)
returns table (user_id uuid, display_name text, avatar_path text, role text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, coalesce(p.display_name, bu.display_name, 'Membro'), coalesce(p.avatar_path, bu.avatar_path), m.role, m.state
    from baptista.household_members m
    left join baptista.profiles p on p.user_id = m.user_id
    left join baptista.users bu on bu.id = m.user_id
   where m.household_id = p_household_id
     and m.state in ('active', 'pending')
     and baptista.is_active_member(p_household_id)
   order by m.role, coalesce(p.display_name, bu.display_name, '');
$$;

-- ---------------------------------------------------------------------------
-- 4. Drop FK constraints to auth.users
-- ---------------------------------------------------------------------------
-- The UUID columns stay (data is preserved), but FK enforcement is removed so
-- future users don't need auth.users rows.

-- households.created_by
alter table baptista.households drop constraint if exists households_created_by_fkey;

-- household_members.user_id and household_members.invited_by
alter table baptista.household_members drop constraint if exists household_members_user_id_fkey;
alter table baptista.household_members drop constraint if exists household_members_invited_by_fkey;

-- profiles.user_id
alter table baptista.profiles drop constraint if exists profiles_user_id_fkey;
alter table baptista.profiles drop constraint if exists profiles_pkey;
alter table baptista.profiles add primary key (user_id);

-- calendar_events
alter table baptista.calendar_events drop constraint if exists calendar_events_owner_user_id_fkey;
alter table baptista.calendar_events drop constraint if exists calendar_events_created_by_fkey;

-- tasks
alter table baptista.tasks drop constraint if exists tasks_owner_user_id_fkey;
alter table baptista.tasks drop constraint if exists tasks_created_by_fkey;

-- notes
alter table baptista.notes drop constraint if exists notes_owner_user_id_fkey;
alter table baptista.notes drop constraint if exists notes_created_by_fkey;

-- goals
alter table baptista.goals drop constraint if exists goals_owner_user_id_fkey;
alter table baptista.goals drop constraint if exists goals_created_by_fkey;

-- habits
alter table baptista.habits drop constraint if exists habits_owner_user_id_fkey;
alter table baptista.habits drop constraint if exists habits_created_by_fkey;

-- habit_entries
alter table baptista.habit_entries drop constraint if exists habit_entries_created_by_fkey;

-- events
alter table baptista.events drop constraint if exists events_actor_user_id_fkey;
alter table baptista.events drop constraint if exists events_owner_user_id_fkey;

-- observations
alter table baptista.observations drop constraint if exists observations_owner_user_id_fkey;

-- observation_dismissals
alter table baptista.observation_dismissals drop constraint if exists observation_dismissals_dismissed_by_fkey;

-- food_items
alter table baptista.food_items drop constraint if exists food_items_owner_user_id_fkey;
alter table baptista.food_items drop constraint if exists food_items_created_by_fkey;

-- meals
alter table baptista.meals drop constraint if exists meals_owner_user_id_fkey;
alter table baptista.meals drop constraint if exists meals_created_by_fkey;

-- recipes
alter table baptista.recipes drop constraint if exists recipes_owner_user_id_fkey;
alter table baptista.recipes drop constraint if exists recipes_created_by_fkey;

-- expense_categories
alter table baptista.expense_categories drop constraint if exists expense_categories_created_by_fkey;

-- expenses
alter table baptista.expenses drop constraint if exists expenses_owner_user_id_fkey;
alter table baptista.expenses drop constraint if exists expenses_created_by_fkey;

-- finance_goals
alter table baptista.finance_goals drop constraint if exists finance_goals_owner_user_id_fkey;
alter table baptista.finance_goals drop constraint if exists finance_goals_created_by_fkey;

-- budgets
alter table baptista.budgets drop constraint if exists budgets_created_by_fkey;

-- wardrobe_items
alter table baptista.wardrobe_items drop constraint if exists wardrobe_items_owner_user_id_fkey;
alter table baptista.wardrobe_items drop constraint if exists wardrobe_items_created_by_fkey;

-- foods (catalog)
alter table baptista.foods drop constraint if exists foods_created_by_fkey;

-- diet_entries
alter table baptista.diet_entries drop constraint if exists diet_entries_owner_user_id_fkey;
alter table baptista.diet_entries drop constraint if exists diet_entries_created_by_fkey;

-- shopping_items
alter table baptista.shopping_items drop constraint if exists shopping_items_owner_user_id_fkey;

-- presentations
alter table baptista.presentations drop constraint if exists presentations_user_id_fkey;

-- invitations
alter table baptista.invitations drop constraint if exists invitations_invited_by_fkey;

-- connections / connection_events
alter table baptista.connections drop constraint if exists connections_owner_user_id_fkey;
alter table baptista.connections drop constraint if exists connections_created_by_fkey;
alter table baptista.connection_events drop constraint if exists connection_events_created_by_fkey;

-- looks
alter table baptista.looks drop constraint if exists looks_owner_user_id_fkey;
alter table baptista.looks drop constraint if exists looks_created_by_fkey;
