-- Invite-only access, household lifecycle and departed-member cleanup (decision D31).
-- * Baptista is invite-only: a Baptista profile can only be created by redeeming an invite code.
--   Auth is shared with GuideApp, so the gate lives here (profiles), not in Auth sign-up.
-- * Owners invite any email: existing Baptista users get a pending membership as before; other
--   addresses get a one-time code (hash stored) that the owner shares out of band.
-- * The last active member leaving deletes the household; deleting an owner's account promotes
--   the longest-standing active member instead of being blocked.
-- * Private data of a member who left is purged 30 days after they left (lazily, on app use).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table baptista.household_invitations (
  household_id uuid not null references baptista.households (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  code_hash bytea not null,
  invited_by uuid references auth.users (id) on delete set null,
  attempts integer not null default 0,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  primary key (household_id, email)
);

create index household_invitations_email_idx on baptista.household_invitations (email);

-- Throttle for the lazy purge (kept off `households` so it never bumps its version).
create table baptista.household_maintenance (
  household_id uuid primary key references baptista.households (id) on delete cascade,
  purged_at timestamptz not null
);

alter table baptista.household_invitations enable row level security;
alter table baptista.household_maintenance enable row level security;
-- No policies and no grants: only the procedures below touch these tables.
revoke all on baptista.household_invitations, baptista.household_maintenance from public, anon, authenticated;
grant all on baptista.household_invitations, baptista.household_maintenance to service_role;

-- Profiles are no longer self-provisioned: claim_invitation creates them.
drop policy profiles_insert_own on baptista.profiles;
revoke insert on baptista.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- 8 characters from an unambiguous alphabet (40 random bits), e.g. "K7PQ3MZA".
create function baptista.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '' order by i)
    from (select uuid_send(gen_random_uuid()) as b) s,
         unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i;
$$;

create function baptista.invite_code_hash(p_code text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8'));
$$;

-- ---------------------------------------------------------------------------
-- Owner invariant: rewritten for household deletion and account deletion
-- ---------------------------------------------------------------------------

-- Deferred to commit. No active member left: the household is deleted. No active owner left: an
-- account deletion promotes the longest-standing active member, anything else is refused.
-- Security definer: account deletion cascades here as the Auth admin role.
create or replace function baptista.tg_protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := coalesce(new.household_id, old.household_id);
begin
  if not exists (select 1 from baptista.households where id = hid) then
    return null;
  end if;
  if not exists (select 1 from baptista.household_members where household_id = hid and state = 'active') then
    delete from baptista.households where id = hid;
    return null;
  end if;
  if not exists (
    select 1 from baptista.household_members where household_id = hid and role = 'owner' and state = 'active'
  ) then
    if tg_op = 'DELETE' then
      update baptista.household_members set role = 'owner'
       where household_id = hid
         and user_id = (
           select user_id from baptista.household_members
            where household_id = hid and state = 'active'
            order by accepted_at, created_at
            limit 1
         );
    else
      raise exception 'last_owner' using errcode = 'P0001';
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Procedures
-- ---------------------------------------------------------------------------

-- Returns null when the address already has a Baptista profile (pending membership, accepted in
-- the app), otherwise the one-time code to share. Re-inviting the same address issues a new code.
-- A former member's revoked_at is kept so the 30-day purge clock does not restart on re-invite.
drop function baptista.invite_member(uuid, text);
create function baptista.invite_member(p_household_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := baptista.require_uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  target uuid;
  current_state text;
  code text;
begin
  if not baptista.is_household_owner(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid' using errcode = '22023';
  end if;

  select u.id into target
    from auth.users u
    join baptista.profiles p on p.user_id = u.id
   where lower(u.email) = v_email;

  if target is not null then
    if target = uid then
      raise exception 'invite_unavailable' using errcode = 'P0001';
    end if;
    select state into current_state from baptista.household_members
     where household_id = p_household_id and user_id = target;
    if current_state in ('pending', 'active') then
      raise exception 'invite_unavailable' using errcode = 'P0001';
    elsif current_state = 'revoked' then
      update baptista.household_members
         set state = 'pending', role = 'member', invited_by = uid, accepted_at = null
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

-- Redeems a code for the caller's own email (from auth.users, never from the client): creates the
-- Baptista profile if missing and makes the caller an active member. Returns the household id, or
-- null for a wrong/expired code. Wrong attempts are counted (committed) and lock the address's
-- invitations after 5; the owner then re-invites.
create function baptista.claim_invitation(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := baptista.require_uid();
  v_email text;
  inv record;
begin
  select lower(email) into v_email from auth.users where id = uid;
  if v_email is null then
    return null;
  end if;

  select household_id, invited_by into inv
    from baptista.household_invitations
   where email = v_email and code_hash = baptista.invite_code_hash(p_code)
     and expires_at > now() and attempts < 5
   limit 1;
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

-- Owner view of open email invitations (codes are never readable again).
create function baptista.list_invitations(p_household_id uuid)
returns table (email text, expires_at timestamptz, locked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select i.email, i.expires_at, i.attempts >= 5
    from baptista.household_invitations i
   where i.household_id = p_household_id and baptista.is_household_owner(p_household_id)
   order by i.created_at desc;
$$;

create function baptista.cancel_invitation(p_household_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform baptista.require_uid();
  if not baptista.is_household_owner(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from baptista.household_invitations
   where household_id = p_household_id and email = lower(btrim(p_email));
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Declining keeps an earlier revoked_at (former member re-invited): the purge clock continues.
create or replace function baptista.respond_to_invite(p_household_id uuid, p_accept boolean)
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
         revoked_at = case when p_accept then null else coalesce(revoked_at, now()) end
   where household_id = p_household_id and user_id = uid and state = 'pending';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Owner removes a member (or cancels a pending invite); any member can leave. The owner trigger
-- refuses an owner leaving other members behind and deletes the household when nobody is left.
create or replace function baptista.remove_member(p_household_id uuid, p_user_id uuid)
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
     set revoked_at = case when state = 'active' then now() else coalesce(revoked_at, now()) end,
         state = 'revoked', accepted_at = null
   where household_id = p_household_id and user_id = p_user_id and state in ('pending', 'active');
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Departed-member purge
-- ---------------------------------------------------------------------------

-- A user departed from a household more than 30 days ago (still pending after a re-invite counts),
-- or whose account was deleted (owner_user_id set to null by the FK).
create function baptista.departed_users(p_household_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(user_id), '{}')
    from baptista.household_members
   where household_id = p_household_id and state <> 'active'
     and revoked_at < now() - interval '30 days';
$$;

-- Private records of departed users and their presentation memory. Household-visible records
-- stay with the household. Runs at most once a day per household; any active member can trigger
-- it. Returns the storage paths of deleted wardrobe photos so the caller removes the files.
create function baptista.purge_departed_data(p_household_id uuid)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  departed uuid[];
  t text;
begin
  if not baptista.is_active_member(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into baptista.household_maintenance (household_id, purged_at) values (p_household_id, now())
  on conflict (household_id) do update set purged_at = now()
   where baptista.household_maintenance.purged_at < now() - interval '1 day';
  if not found then
    return;
  end if;

  departed := baptista.departed_users(p_household_id);

  return query
    with gone as (
      delete from baptista.wardrobe_items
       where household_id = p_household_id and visibility = 'private'
         and (owner_user_id is null or owner_user_id = any (departed))
      returning original_path, thumb_path, processed_path
    )
    select p from gone, unnest(array[gone.original_path, gone.thumb_path, gone.processed_path]) as p
     where p is not null;

  foreach t in array array[
    'calendar_events', 'tasks', 'notes', 'goals', 'habits', 'food_items', 'meals', 'diet_entries',
    'recipes', 'finance_goals', 'expenses', 'events', 'observations'
  ] loop
    execute format(
      'delete from baptista.%I where household_id = $1 and visibility = ''private''
          and (owner_user_id is null or owner_user_id = any ($2))', t)
    using p_household_id, departed;
  end loop;

  delete from baptista.baptista_presentations where household_id = p_household_id and user_id = any (departed);
end;
$$;

-- After the purge deleted their items, a departed user's wardrobe photos are orphans: any active
-- member may read (needed by storage DELETE ... RETURNING) and delete them so the app removes the
-- files. Photos still used by any item, private or shared, are not affected.
create function baptista.wardrobe_object_orphaned(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select baptista.is_active_member(baptista.storage_path_household(p_name))
     and split_part(p_name, '/', 2) in (
       select d::text from unnest(baptista.departed_users(baptista.storage_path_household(p_name))) d
     )
     and not exists (
       select 1 from baptista.wardrobe_items w
        where w.original_path = p_name or w.thumb_path = p_name or w.processed_path = p_name
     );
$$;

create or replace function baptista.wardrobe_object_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select baptista.wardrobe_object_writable(p_name)
      or exists (
        select 1 from baptista.wardrobe_items w
         where (w.original_path = p_name or w.thumb_path = p_name or w.processed_path = p_name)
           and baptista.can_access(w.household_id, w.owner_user_id, w.visibility)
      )
      or baptista.wardrobe_object_orphaned(p_name);
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  baptista.new_invite_code(),
  baptista.invite_code_hash(text),
  baptista.tg_protect_last_owner(),
  baptista.invite_member(uuid, text),
  baptista.claim_invitation(text, text),
  baptista.list_invitations(uuid),
  baptista.cancel_invitation(uuid, text),
  baptista.departed_users(uuid),
  baptista.wardrobe_object_orphaned(text),
  baptista.purge_departed_data(uuid)
from public, anon;
revoke execute on function
  baptista.new_invite_code(),
  baptista.invite_code_hash(text),
  baptista.tg_protect_last_owner(),
  baptista.departed_users(uuid)
from authenticated;
grant execute on function
  baptista.invite_member(uuid, text),
  baptista.claim_invitation(text, text),
  baptista.list_invitations(uuid),
  baptista.cancel_invitation(uuid, text),
  baptista.wardrobe_object_orphaned(text),
  baptista.purge_departed_data(uuid)
to authenticated;
grant execute on all functions in schema baptista to service_role;
