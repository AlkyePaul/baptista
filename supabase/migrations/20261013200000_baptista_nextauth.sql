-- NextAuth migration: baptista.users table, function updates, FK drops.
-- UUIDs are preserved: all existing records stay linked.
-- The minted-JWT approach (jose HS256 signed with SUPABASE_JWT_SECRET) makes
-- auth.uid() return the correct UUID, so all existing RLS policies, triggers
-- and RPCs continue working unchanged.

-- 1. baptista.users table
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
create policy users_select_own on baptista.users
  for select to authenticated using (id = (select auth.uid()));
revoke all on baptista.users from public, anon;
grant select on baptista.users to authenticated;
grant all on baptista.users to service_role;
create trigger users_touch before update on baptista.users
  for each row execute function baptista.tg_touch();

-- 2. Seed
insert into baptista.users (id, email, display_name, avatar_path, household_id, role)
select u.id, lower(u.email), a.display_name, p.avatar_path, a.household_id, a.role
  from baptista.app_users a
  join auth.users u on lower(u.email) = a.email
  left join baptista.profiles p on p.user_id = u.id
on conflict (id) do nothing;

-- 3. Function updates
create or replace function baptista.is_app_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from baptista.users where id = p_user_id);
$$;

drop function baptista.invite_member(uuid, text);
create function baptista.invite_member(p_household_id uuid, p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := baptista.require_uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  target uuid; current_state text; code text;
begin
  if not baptista.is_household_owner(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid' using errcode = '22023';
  end if;
  select u.id into target from baptista.users u
    join baptista.profiles p on p.user_id = u.id where lower(u.email) = v_email;
  if target is not null then
    if target = uid then raise exception 'invite_unavailable' using errcode = 'P0001'; end if;
    select state into current_state from baptista.household_members
     where household_id = p_household_id and user_id = target;
    if current_state in ('pending', 'active') then
      raise exception 'invite_unavailable' using errcode = 'P0001';
    elsif current_state = 'revoked' then
      update baptista.household_members set state = 'pending', role = 'member', invited_by = uid, accepted_at = null
       where household_id = p_household_id and user_id = target;
    else
      insert into baptista.household_members (household_id, user_id, role, state, invited_by)
      values (p_household_id, target, 'member', 'pending', uid);
    end if;
    return null;
  end if;
  if (select count(*) from baptista.household_invitations
       where household_id = p_household_id and email <> v_email and expires_at > now()) >= 20 then
    raise exception 'too_many_invites' using errcode = 'P0001';
  end if;
  code := baptista.new_invite_code();
  insert into baptista.household_invitations (household_id, email, code_hash, invited_by)
  values (p_household_id, v_email, baptista.invite_code_hash(code), uid)
  on conflict (household_id, email) do update
     set code_hash = excluded.code_hash, invited_by = excluded.invited_by, attempts = 0,
         expires_at = excluded.expires_at, created_at = now();
  return code;
end;
$$;
revoke execute on function baptista.invite_member(uuid, text) from public, anon;
grant execute on function baptista.invite_member(uuid, text) to authenticated;
grant execute on function baptista.invite_member(uuid, text) to service_role;

create or replace function baptista.claim_invitation(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := baptista.require_uid(); v_email text; inv record;
begin
  select lower(email) into v_email from baptista.users where id = uid;
  if v_email is null then return null; end if;
  select household_id, invited_by into inv from baptista.household_invitations
   where email = v_email and code_hash = baptista.invite_code_hash(p_code)
     and expires_at > now() and attempts < 5 limit 1;
  if inv.household_id is null then
    update baptista.household_invitations set attempts = attempts + 1 where email = v_email;
    return null;
  end if;
  insert into baptista.profiles (user_id, display_name)
  values (uid, left(coalesce(nullif(btrim(p_display_name), ''), 'Io'), 60))
  on conflict (user_id) do nothing;
  insert into baptista.household_members (household_id, user_id, role, state, invited_by, accepted_at)
  values (inv.household_id, uid, 'member', 'active', inv.invited_by, now())
  on conflict (household_id, user_id) do update
     set state = 'active', role = case when baptista.household_members.state = 'active'
                                       then baptista.household_members.role else 'member' end,
         accepted_at = coalesce(baptista.household_members.accepted_at, now()), revoked_at = null;
  delete from baptista.household_invitations where household_id = inv.household_id and email = v_email;
  return inv.household_id;
end;
$$;

create or replace function baptista.apply_app_user(p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(p_email)); uid uuid; a record;
begin
  select id into uid from baptista.users where email = v_email limit 1;
  if uid is null then return null; end if;
  select email, display_name, household_id, role into a from baptista.app_users where email = v_email;
  update baptista.household_members
     set revoked_at = case when state = 'active' then now() else coalesce(revoked_at, now()) end,
         state = 'revoked', accepted_at = null
   where user_id = uid and state <> 'revoked'
     and (a.email is null or household_id is distinct from a.household_id);
  if a.email is null then return null; end if;
  insert into baptista.profiles (user_id, display_name) values (uid, a.display_name)
  on conflict (user_id) do nothing;
  if a.household_id is null then return null; end if;
  insert into baptista.household_members (household_id, user_id, role, state, accepted_at)
  values (a.household_id, uid, a.role, 'active', now())
  on conflict (household_id, user_id) do update
     set role = excluded.role, state = 'active',
         accepted_at = coalesce(baptista.household_members.accepted_at, now()), revoked_at = null;
  return a.household_id;
end;
$$;

create or replace function baptista.claim_app_user()
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_email text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select lower(email) into v_email from baptista.users where id = uid;
  if v_email is null or not exists (select 1 from baptista.app_users where email = v_email) then
    return null;
  end if;
  return baptista.apply_app_user(v_email);
end;
$$;

create or replace function baptista.household_directory(p_household_id uuid)
returns table (user_id uuid, display_name text, avatar_path text, role text, state text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(p.display_name, bu.display_name, 'Membro'),
         coalesce(p.avatar_path, bu.avatar_path), m.role, m.state
    from baptista.household_members m
    left join baptista.profiles p on p.user_id = m.user_id
    left join baptista.users bu on bu.id = m.user_id
   where m.household_id = p_household_id
     and m.state in ('active', 'pending')
     and baptista.is_active_member(p_household_id)
   order by m.role, coalesce(p.display_name, bu.display_name, '');
$$;

-- 4. Drop all FK constraints to auth.users
alter table baptista.baptista_presentations drop constraint baptista_presentations_user_id_fkey;
alter table baptista.budgets drop constraint budgets_created_by_fkey;
alter table baptista.calendar_events drop constraint calendar_events_created_by_fkey;
alter table baptista.calendar_events drop constraint calendar_events_owner_user_id_fkey;
alter table baptista.categories drop constraint categories_owner_user_id_fkey;
alter table baptista.diet_entries drop constraint diet_entries_created_by_fkey;
alter table baptista.diet_entries drop constraint diet_entries_owner_user_id_fkey;
alter table baptista.events drop constraint events_actor_user_id_fkey;
alter table baptista.events drop constraint events_owner_user_id_fkey;
alter table baptista.expense_categories drop constraint expense_categories_created_by_fkey;
alter table baptista.expenses drop constraint expenses_created_by_fkey;
alter table baptista.expenses drop constraint expenses_owner_user_id_fkey;
alter table baptista.finance_goals drop constraint finance_goals_created_by_fkey;
alter table baptista.finance_goals drop constraint finance_goals_owner_user_id_fkey;
alter table baptista.food_items drop constraint food_items_created_by_fkey;
alter table baptista.food_items drop constraint food_items_owner_user_id_fkey;
alter table baptista.foods drop constraint foods_created_by_fkey;
alter table baptista.goals drop constraint goals_created_by_fkey;
alter table baptista.goals drop constraint goals_owner_user_id_fkey;
alter table baptista.habit_entries drop constraint habit_entries_created_by_fkey;
alter table baptista.habits drop constraint habits_created_by_fkey;
alter table baptista.habits drop constraint habits_owner_user_id_fkey;
alter table baptista.household_invitations drop constraint household_invitations_invited_by_fkey;
alter table baptista.household_members drop constraint household_members_invited_by_fkey;
alter table baptista.household_members drop constraint household_members_user_id_fkey;
alter table baptista.households drop constraint households_created_by_fkey;
alter table baptista.meals drop constraint meals_created_by_fkey;
alter table baptista.meals drop constraint meals_owner_user_id_fkey;
alter table baptista.notes drop constraint notes_created_by_fkey;
alter table baptista.notes drop constraint notes_owner_user_id_fkey;
alter table baptista.observations drop constraint observations_dismissed_by_fkey;
alter table baptista.observations drop constraint observations_owner_user_id_fkey;
alter table baptista.profiles drop constraint profiles_user_id_fkey;
alter table baptista.recipes drop constraint recipes_created_by_fkey;
alter table baptista.recipes drop constraint recipes_owner_user_id_fkey;
alter table baptista.shopping_items drop constraint shopping_items_created_by_fkey;
alter table baptista.shopping_items drop constraint shopping_items_owner_user_id_fkey;
alter table baptista.tasks drop constraint tasks_created_by_fkey;
alter table baptista.tasks drop constraint tasks_owner_user_id_fkey;
alter table baptista.wardrobe_items drop constraint wardrobe_items_created_by_fkey;
alter table baptista.wardrobe_items drop constraint wardrobe_items_owner_user_id_fkey;
