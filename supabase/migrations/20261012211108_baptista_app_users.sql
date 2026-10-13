-- D33 (user 2026-10-12): Baptista is a private family app, not a product for distribution yet.
-- `app_users` is the single source of who may use Baptista and in which household: one row per
-- email, edited by hand in the Supabase Table Editor (no client access). Login stays Supabase
-- Auth email + password (shared with GuideApp); invitation codes, sign-up and onboarding are
-- retired from the app. The invitation tables and procedures of D32 stay in place, unused.
--
-- A row is applied to the matching Auth account on every change (and at sign-in, for accounts
-- created after the row): Baptista profile, active membership with the row's role, revocation
-- of other memberships. Deleting a row revokes the membership (D32 30-day purge of private data
-- still applies). Every procedure now refuses callers that are not in `app_users`.

create table baptista.app_users (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  household_id uuid references baptista.households (id) on delete set null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table baptista.app_users enable row level security;
-- No policies and no grants: only the dashboard (postgres) and the procedures below touch it.
revoke all on baptista.app_users from public, anon, authenticated;
grant all on baptista.app_users to service_role;

create trigger app_users_touch before update on baptista.app_users
  for each row execute function baptista.tg_touch();

-- ---------------------------------------------------------------------------
-- Allowlist check, used by require_uid()
-- ---------------------------------------------------------------------------

create function baptista.is_app_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users u
      join baptista.app_users a on a.email = lower(u.email)
     where u.id = p_user_id
  );
$$;

create or replace function baptista.require_uid()
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
  if not baptista.is_app_user(uid) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Applying a row to its Auth account
-- ---------------------------------------------------------------------------

-- Makes the Auth account with this email match its `app_users` row; returns the household id, or
-- null when there is no account, no row (membership revoked) or no household on the row.
create function baptista.apply_app_user(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  uid uuid;
  a record;
begin
  select id into uid from auth.users where lower(email) = v_email limit 1;
  if uid is null then
    return null;
  end if;

  select email, display_name, household_id, role into a from baptista.app_users where email = v_email;

  -- Memberships outside the row's household (all of them once the row is gone) are revoked.
  update baptista.household_members
     set revoked_at = case when state = 'active' then now() else coalesce(revoked_at, now()) end,
         state = 'revoked', accepted_at = null
   where user_id = uid and state <> 'revoked'
     and (a.email is null or household_id is distinct from a.household_id);

  if a.email is null then
    return null;
  end if;

  insert into baptista.profiles (user_id, display_name)
  values (uid, a.display_name)
  on conflict (user_id) do nothing;

  if a.household_id is null then
    return null;
  end if;

  insert into baptista.household_members (household_id, user_id, role, state, accepted_at)
  values (a.household_id, uid, a.role, 'active', now())
  on conflict (household_id, user_id) do update
     set role = excluded.role, state = 'active',
         accepted_at = coalesce(baptista.household_members.accepted_at, now()), revoked_at = null;
  return a.household_id;
end;
$$;

create function baptista.tg_app_users_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform baptista.apply_app_user(old.email);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform baptista.apply_app_user(new.email);
  end if;
  return null;
end;
$$;
create trigger app_users_apply after insert or update or delete on baptista.app_users
  for each row execute function baptista.tg_app_users_apply();

-- Called by the app right after sign-in: applies the caller's own row (email from auth.users,
-- never from the client). Returns the household id, or null when the caller is not allowed.
create function baptista.claim_app_user()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_email text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = uid;
  if v_email is null or not exists (select 1 from baptista.app_users where email = v_email) then
    return null;
  end if;
  return baptista.apply_app_user(v_email);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  baptista.is_app_user(uuid),
  baptista.require_uid(),
  baptista.apply_app_user(text),
  baptista.tg_app_users_apply(),
  baptista.claim_app_user()
from public, anon;
-- require_uid() and is_app_user() run only inside security definer procedures (as before).
revoke execute on function
  baptista.is_app_user(uuid),
  baptista.require_uid(),
  baptista.apply_app_user(text),
  baptista.tg_app_users_apply()
from authenticated;
grant execute on function baptista.claim_app_user() to authenticated;
grant execute on all functions in schema baptista to service_role;
