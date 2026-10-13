-- Phase 05 — Enable the processed_path column (background-removed PNG).
-- The column already exists (created in Phase 04 migration); this adds grants, trigger validation,
-- and a CHECK constraint to match the existing pattern for original_path / thumb_path.

-- 1. Column grants: allow INSERT and UPDATE of processed_path by authenticated users.
grant insert (processed_path) on baptista.wardrobe_items to authenticated;
grant update (processed_path) on baptista.wardrobe_items to authenticated;

-- 2. CHECK constraint: processed_path must sit under the household folder (same as original_path).
alter table baptista.wardrobe_items
  add constraint wardrobe_items_processed_path_household
  check (processed_path is null or processed_path like household_id::text || '/%');

-- 3. Path trigger: validate that processed_path belongs to the current user's folder.
create or replace function baptista.tg_wardrobe_paths()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.original_path is not null
     and (tg_op = 'INSERT' or new.original_path is distinct from old.original_path)
     and split_part(new.original_path, '/', 2) <> auth.uid()::text then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new.thumb_path is not null
     and (tg_op = 'INSERT' or new.thumb_path is distinct from old.thumb_path)
     and split_part(new.thumb_path, '/', 2) <> auth.uid()::text then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new.processed_path is not null
     and (tg_op = 'INSERT' or new.processed_path is distinct from old.processed_path)
     and split_part(new.processed_path, '/', 2) <> auth.uid()::text then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;
