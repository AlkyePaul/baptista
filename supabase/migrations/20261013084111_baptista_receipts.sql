-- Receipt photo attached to an expense (phase 04, no extraction: that is phase 05).
-- Private bucket `baptista-receipts` with policies scoped to that bucket only (SECURITY.md:
-- infrastructure exception, no change to other buckets or policies). Same path rules as the
-- wardrobe: <household>/<uploader>/<upload>/<server name>.

-- ---------------------------------------------------------------------------
-- expenses.receipt_path
-- ---------------------------------------------------------------------------

alter table baptista.expenses add column receipt_path text check (
  receipt_path is null
  or (split_part(receipt_path, '/', 1) = household_id::text
      and array_length(string_to_array(receipt_path, '/'), 1) = 4
      and char_length(receipt_path) <= 300)
);

grant insert (receipt_path), update (receipt_path) on baptista.expenses to authenticated;

-- A client may only point an expense at a file in its own folder (as for wardrobe photos).
create function baptista.tg_expense_receipt_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.receipt_path is not null
     and (tg_op = 'INSERT' or new.receipt_path is distinct from old.receipt_path)
     and split_part(new.receipt_path, '/', 2) <> auth.uid()::text then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger expenses_receipt_path before insert or update of receipt_path on baptista.expenses
  for each row execute function baptista.tg_expense_receipt_path();

-- ---------------------------------------------------------------------------
-- Storage: private bucket and object policies (this bucket only)
-- ---------------------------------------------------------------------------

-- The server re-encodes every receipt to JPEG (no EXIF/GPS) before upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('baptista-receipts', 'baptista-receipts', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

-- Write: only into the caller's own folder of a household where they are an active member.
create function baptista.receipt_object_writable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and split_part(p_name, '/', 2) = auth.uid()::text
     and array_length(string_to_array(p_name, '/'), 1) = 4
     and coalesce(baptista.is_active_member(baptista.storage_path_household(p_name)), false);
$$;

-- A departed user's receipt no longer used by any expense (after the 30-day purge): any active
-- member may read (needed by storage DELETE ... RETURNING) and delete it.
create function baptista.receipt_object_orphaned(p_name text)
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
     and not exists (select 1 from baptista.expenses e where e.receipt_path = p_name);
$$;

-- Read: the uploader (active member), anyone who can read the expense using the file, or an orphan.
create function baptista.receipt_object_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select baptista.receipt_object_writable(p_name)
      or exists (
        select 1 from baptista.expenses e
         where e.receipt_path = p_name
           and baptista.can_access(e.household_id, e.owner_user_id, e.visibility)
      )
      or baptista.receipt_object_orphaned(p_name);
$$;

create policy baptista_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'baptista-receipts' and baptista.receipt_object_writable(name));
create policy baptista_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'baptista-receipts' and baptista.receipt_object_readable(name));
create policy baptista_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'baptista-receipts' and baptista.receipt_object_readable(name));
-- No update policy: objects are immutable (no upsert, new upload = new key).

-- ---------------------------------------------------------------------------
-- Purge (D32): also return the receipts of deleted private expenses, now with their bucket.
-- ---------------------------------------------------------------------------

drop function baptista.purge_departed_data(uuid);

create function baptista.purge_departed_data(p_household_id uuid)
returns table (bucket text, path text)
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
    select 'baptista-wardrobe'::text, p from gone, unnest(array[gone.original_path, gone.thumb_path, gone.processed_path]) as p
     where p is not null;

  return query
    with gone as (
      delete from baptista.expenses
       where household_id = p_household_id and visibility = 'private'
         and (owner_user_id is null or owner_user_id = any (departed))
      returning receipt_path
    )
    select 'baptista-receipts'::text, gone.receipt_path from gone where gone.receipt_path is not null;

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

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  baptista.tg_expense_receipt_path(),
  baptista.receipt_object_writable(text),
  baptista.receipt_object_orphaned(text),
  baptista.receipt_object_readable(text),
  baptista.purge_departed_data(uuid)
from public, anon;
revoke execute on function baptista.tg_expense_receipt_path() from authenticated;
grant execute on function
  baptista.receipt_object_writable(text),
  baptista.receipt_object_orphaned(text),
  baptista.receipt_object_readable(text),
  baptista.purge_departed_data(uuid)
to authenticated;
grant execute on all functions in schema baptista to service_role;
