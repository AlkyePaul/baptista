-- Categories for habits and goals (decision D24).
-- * System categories: owner_user_id is null, visible to everyone, read-only for clients.
-- * Personal categories: owned by one user, listed and managed only by that user.
-- * A category attached to a record the viewer can read is readable too (name + colour), so a
--   shared habit renders the same for every member; it is still never listed in their picker and
--   cannot be assigned by them.

create table baptista.categories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_system_name_idx on baptista.categories (lower(name)) where owner_user_id is null;
create unique index categories_owner_name_idx on baptista.categories (owner_user_id, lower(name)) where owner_user_id is not null;

create function baptista.tg_category_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.color := lower(new.color);
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.owner_user_id := auth.uid();
  elsif tg_op = 'UPDATE' and new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'immutable_field' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger categories_write before insert or update on baptista.categories
  for each row execute function baptista.tg_category_write();
create trigger categories_touch before update on baptista.categories
  for each row execute function baptista.tg_touch();

alter table baptista.habits add column category_id uuid references baptista.categories (id) on delete set null;
alter table baptista.goals add column category_id uuid references baptista.categories (id) on delete set null;
create index habits_category_idx on baptista.habits (category_id);
create index goals_category_idx on baptista.goals (category_id);

-- Readable through a record: the category is used by a habit/goal the caller can access.
create function baptista.category_visible_through_records(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from baptista.habits h
     where h.category_id = p_category_id and baptista.can_access(h.household_id, h.owner_user_id, h.visibility)
  ) or exists (
    select 1 from baptista.goals g
     where g.category_id = p_category_id and baptista.can_access(g.household_id, g.owner_user_id, g.visibility)
  );
$$;

-- Assignment rule: only system categories or the caller's own (checked when the value changes).
create function baptista.tg_record_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is not null
     and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and auth.uid() is not null
     and not exists (
       select 1 from baptista.categories c
        where c.id = new.category_id and (c.owner_user_id is null or c.owner_user_id = auth.uid())
     ) then
    raise exception 'category_unavailable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger habits_category before insert or update on baptista.habits
  for each row execute function baptista.tg_record_category();
create trigger goals_category before insert or update on baptista.goals
  for each row execute function baptista.tg_record_category();

alter table baptista.categories enable row level security;

create policy categories_select on baptista.categories for select to authenticated
  using (
    owner_user_id is null
    or owner_user_id = (select auth.uid())
    or baptista.category_visible_through_records(id)
  );
create policy categories_insert on baptista.categories for insert to authenticated
  with check (owner_user_id = (select auth.uid()));
create policy categories_update on baptista.categories for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));
create policy categories_delete on baptista.categories for delete to authenticated
  using (owner_user_id = (select auth.uid()));

revoke all on baptista.categories from public, anon, authenticated;
grant select, delete on baptista.categories to authenticated;
grant insert (name, color), update (name, color) on baptista.categories to authenticated;
grant all on baptista.categories to service_role;

grant insert (category_id), update (category_id) on baptista.habits, baptista.goals to authenticated;

revoke execute on function
  baptista.category_visible_through_records(uuid),
  baptista.tg_category_write(),
  baptista.tg_record_category()
from public, anon;
grant execute on function baptista.category_visible_through_records(uuid) to authenticated;

-- System categories (Italian product language, D12).
insert into baptista.categories (owner_user_id, name, color) values
  (null, 'Salute', '#e0795b'),
  (null, 'Sport', '#3f9d8c'),
  (null, 'Alimentazione', '#d9a33a'),
  (null, 'Benessere mentale', '#7a6fd0'),
  (null, 'Casa', '#8a6d4f'),
  (null, 'Lavoro', '#4f8fd6'),
  (null, 'Studio', '#2f7f9f'),
  (null, 'Finanze', '#6aa04f'),
  (null, 'Famiglia', '#c45f8f'),
  (null, 'Tempo libero', '#e6a23c');
