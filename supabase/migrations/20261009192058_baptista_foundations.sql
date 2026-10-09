-- Phase 01 — identity and household foundations (docs/architecture/DATABASE.md, SECURITY.md).
-- Only baptista.* objects. Fail-closed: anon has nothing; authenticated reads through RLS and
-- writes membership/household state only through the procedures below.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table baptista.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  timezone text not null default 'Europe/Rome',
  created_by uuid references auth.users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table baptista.household_members (
  household_id uuid not null references baptista.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  state text not null check (state in ('pending', 'active', 'revoked')),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id),
  check (state <> 'active' or (accepted_at is not null and revoked_at is null)),
  check (state <> 'revoked' or revoked_at is not null)
);

create index household_members_user_state_idx on baptista.household_members (user_id, state);
create index household_members_household_state_idx on baptista.household_members (household_id, state);

create table baptista.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------

create function baptista.tg_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and to_jsonb(old) ? 'version' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create function baptista.tg_household_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger households_validate before insert or update on baptista.households
  for each row execute function baptista.tg_household_validate();
create trigger households_touch before update on baptista.households
  for each row execute function baptista.tg_touch();
create trigger household_members_touch before update on baptista.household_members
  for each row execute function baptista.tg_touch();
create trigger profiles_touch before update on baptista.profiles
  for each row execute function baptista.tg_touch();

-- Every household with members keeps at least one active owner.
create function baptista.tg_protect_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  hid uuid := coalesce(new.household_id, old.household_id);
begin
  if exists (select 1 from baptista.household_members where household_id = hid)
     and not exists (
       select 1 from baptista.household_members
       where household_id = hid and role = 'owner' and state = 'active'
     ) then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create constraint trigger household_members_last_owner
  after update or delete on baptista.household_members
  deferrable initially deferred
  for each row execute function baptista.tg_protect_last_owner();

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer: avoid RLS recursion on household_members)
-- ---------------------------------------------------------------------------

create function baptista.is_active_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from baptista.household_members
    where household_id = p_household_id and user_id = auth.uid() and state = 'active'
  );
$$;

create function baptista.is_household_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from baptista.household_members
    where household_id = p_household_id and user_id = auth.uid()
      and state = 'active' and role = 'owner'
  );
$$;

create function baptista.has_pending_invite(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from baptista.household_members
    where household_id = p_household_id and user_id = auth.uid() and state = 'pending'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table baptista.households enable row level security;
alter table baptista.household_members enable row level security;
alter table baptista.profiles enable row level security;

create policy households_select on baptista.households
  for select to authenticated
  using (baptista.is_active_member(id) or baptista.has_pending_invite(id));

-- Own membership rows (incl. pending/revoked) plus the active members of my households.
create policy household_members_select on baptista.household_members
  for select to authenticated
  using (user_id = (select auth.uid()) or baptista.is_active_member(household_id));

create policy profiles_select_own on baptista.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_insert_own on baptista.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy profiles_update_own on baptista.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants (minimal; household/membership writes only through procedures)
-- ---------------------------------------------------------------------------

revoke all on baptista.households, baptista.household_members, baptista.profiles from public, anon, authenticated;
grant select on baptista.households, baptista.household_members to authenticated;
grant select on baptista.profiles to authenticated;
grant insert (user_id, display_name, avatar_path) on baptista.profiles to authenticated;
grant update (display_name, avatar_path) on baptista.profiles to authenticated;
grant all on baptista.households, baptista.household_members, baptista.profiles to service_role;

-- ---------------------------------------------------------------------------
-- Procedures
-- ---------------------------------------------------------------------------

create function baptista.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- Bootstrap: household + first owner membership in one transaction.
create function baptista.create_household(p_name text, p_timezone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := baptista.require_uid();
  hid uuid;
begin
  if not exists (select 1 from baptista.profiles where user_id = uid) then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
  insert into baptista.households (name, timezone, created_by)
  values (p_name, coalesce(nullif(p_timezone, ''), 'Europe/Rome'), uid)
  returning id into hid;
  insert into baptista.household_members (household_id, user_id, role, state, accepted_at)
  values (hid, uid, 'owner', 'active', now());
  return hid;
end;
$$;

create function baptista.update_household(
  p_household_id uuid, p_name text, p_timezone text, p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_version integer;
begin
  perform baptista.require_uid();
  if not baptista.is_household_owner(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update baptista.households
     set name = p_name, timezone = p_timezone
   where id = p_household_id and version = p_expected_version
  returning version into new_version;
  if new_version is null then
    raise exception 'conflict' using errcode = '40001';
  end if;
  return new_version;
end;
$$;

-- Owner proposes membership to an existing Baptista user (has a profile), resolved by email on
-- the server. Unknown addresses and users without a Baptista profile get the same error.
create function baptista.invite_member(p_household_id uuid, p_email text)
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
    from auth.users u
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

create function baptista.respond_to_invite(p_household_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := baptista.require_uid();
begin
  update baptista.household_members
     set state = case when p_accept then 'active' else 'revoked' end,
         accepted_at = case when p_accept then now() else null end,
         revoked_at = case when p_accept then null else now() end
   where household_id = p_household_id and user_id = uid and state = 'pending';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Owner removes a member (or cancels an invite); any member can leave. Last owner is protected.
create function baptista.remove_member(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := baptista.require_uid();
begin
  if p_user_id <> uid and not baptista.is_household_owner(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update baptista.household_members
     set state = 'revoked', revoked_at = now(), accepted_at = null
   where household_id = p_household_id and user_id = p_user_id and state in ('pending', 'active');
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

create function baptista.transfer_ownership(p_household_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := baptista.require_uid();
begin
  if not baptista.is_household_owner(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update baptista.household_members set role = 'owner'
   where household_id = p_household_id and user_id = p_new_owner and state = 'active';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update baptista.household_members set role = 'member'
   where household_id = p_household_id and user_id = uid;
end;
$$;

-- Minimal directory of a household: display name + avatar of active/pending members only.
create function baptista.household_directory(p_household_id uuid)
returns table (user_id uuid, display_name text, avatar_path text, role text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, coalesce(p.display_name, 'Membro'), p.avatar_path, m.role, m.state
    from baptista.household_members m
    left join baptista.profiles p on p.user_id = m.user_id
   where m.household_id = p_household_id
     and m.state in ('active', 'pending')
     and baptista.is_active_member(p_household_id)
   order by m.role, coalesce(p.display_name, '');
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema baptista from public, anon;
grant execute on function
  baptista.is_active_member(uuid),
  baptista.is_household_owner(uuid),
  baptista.has_pending_invite(uuid),
  baptista.create_household(text, text),
  baptista.update_household(uuid, text, text, integer),
  baptista.invite_member(uuid, text),
  baptista.respond_to_invite(uuid, boolean),
  baptista.remove_member(uuid, uuid),
  baptista.transfer_ownership(uuid, uuid),
  baptista.household_directory(uuid)
to authenticated;
grant execute on all functions in schema baptista to service_role;
