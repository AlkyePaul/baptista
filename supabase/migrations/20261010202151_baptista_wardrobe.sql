-- Phase 04 — Guardaroba, deterministic (D28): clothes photographed and classified by hand.
-- Private bucket `baptista-wardrobe` with policies scoped to that bucket only (SECURITY.md:
-- infrastructure exception, no change to other buckets or policies).
-- Object path: <household_uuid>/<owner_uuid>/<upload_uuid>/<server_generated_name>.

-- ---------------------------------------------------------------------------
-- Wardrobe items
-- ---------------------------------------------------------------------------

create table baptista.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  type text not null check (type in ('top', 'knitwear', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory', 'sportswear', 'underwear', 'other')),
  subtype text check (subtype is null or char_length(subtype) <= 60),
  primary_color text check (primary_color is null or primary_color in
    ('black', 'white', 'grey', 'blue', 'navy', 'light_blue', 'red', 'pink', 'green', 'yellow', 'orange', 'brown', 'beige', 'purple', 'multicolor')),
  secondary_colors text[] not null default '{}' check (cardinality(secondary_colors) <= 5),
  pattern text check (pattern is null or pattern in ('solid', 'stripes', 'checks', 'dots', 'floral', 'print', 'other')),
  material text check (material is null or char_length(material) <= 60),
  seasons text[] not null default '{}' check (seasons <@ array['spring', 'summer', 'autumn', 'winter']),
  formality text check (formality is null or formality in ('casual', 'smart', 'formal', 'sport')),
  brand text check (brand is null or char_length(brand) <= 60),
  size text check (size is null or char_length(size) <= 20),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  notes text check (notes is null or char_length(notes) <= 1000),
  -- Photo: the original (private) and an EXIF-free thumbnail made by the server.
  -- processed_path is reserved for the background-removed derivative (Phase 05, D28).
  original_path text,
  thumb_path text,
  processed_path text,
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  status text not null default 'active' check (status in ('active', 'archived')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check ((original_path is null) = (thumb_path is null)),
  check (original_path is null or original_path like household_id::text || '/%'),
  check (thumb_path is null or thumb_path like household_id::text || '/%')
);
create index wardrobe_items_household_idx on baptista.wardrobe_items (household_id, status, type);

-- Photos belong to the person who uploaded them: a path must sit under the session user's folder
-- when it is set or changed (the household prefix is checked by the table constraints).
create function baptista.tg_wardrobe_paths()
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
  return new;
end;
$$;

do $$
begin
  create trigger wardrobe_items_insert before insert on baptista.wardrobe_items
    for each row execute function baptista.tg_record_insert();
  create trigger wardrobe_items_guard before update on baptista.wardrobe_items
    for each row execute function baptista.tg_record_update();
  create trigger wardrobe_items_touch before update on baptista.wardrobe_items
    for each row execute function baptista.tg_touch();
  create trigger wardrobe_items_derived after update or delete on baptista.wardrobe_items
    for each row execute function baptista.tg_record_derived();
  create trigger wardrobe_items_paths before insert or update on baptista.wardrobe_items
    for each row execute function baptista.tg_wardrobe_paths();
end;
$$;

-- Event wardrobe.item_added in the same transaction (D17).
create function baptista.tg_emit_wardrobe_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform baptista.emit_event(new.household_id, 'wardrobe.item_added', 'wardrobe_item', new.id,
    new.visibility, new.owner_user_id, jsonb_build_object('type', new.type),
    'wardrobe.item_added:' || new.id);
  return null;
end;
$$;
create trigger wardrobe_items_events after insert on baptista.wardrobe_items
  for each row execute function baptista.tg_emit_wardrobe_events();

alter table baptista.wardrobe_items enable row level security;
create policy wardrobe_items_select on baptista.wardrobe_items for select to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));
create policy wardrobe_items_insert on baptista.wardrobe_items for insert to authenticated
  with check (owner_user_id = (select auth.uid()) and baptista.can_access(household_id, owner_user_id, visibility));
create policy wardrobe_items_update on baptista.wardrobe_items for update to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility))
  with check (baptista.can_access(household_id, owner_user_id, visibility));
create policy wardrobe_items_delete on baptista.wardrobe_items for delete to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));

revoke all on baptista.wardrobe_items from public, anon, authenticated;
grant select, delete on baptista.wardrobe_items to authenticated;
grant insert (household_id, visibility, name, type, subtype, primary_color, secondary_colors, pattern, material,
              seasons, formality, brand, size, tags, notes, original_path, thumb_path, status),
      update (visibility, name, type, subtype, primary_color, secondary_colors, pattern, material,
              seasons, formality, brand, size, tags, notes, original_path, thumb_path, status)
  on baptista.wardrobe_items to authenticated;
grant all on baptista.wardrobe_items to service_role;

-- ---------------------------------------------------------------------------
-- Storage: private bucket and object policies (this bucket only)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('baptista-wardrobe', 'baptista-wardrobe', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Path segments: [1] household, [2] owner, [3] upload id. Invalid UUIDs simply fail closed.
create function baptista.storage_path_household(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

-- Write: only into the caller's own folder of a household where they are an active member.
create function baptista.wardrobe_object_writable(p_name text)
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

-- Read: the uploader (active member) or anyone who can read a wardrobe item using the file.
create function baptista.wardrobe_object_readable(p_name text)
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
      );
$$;

-- Delete: the uploader, or whoever can access the item that uses the file (the app removes the
-- photos first, then the item; RLS requires the row to be readable to delete it anyway).
create function baptista.wardrobe_object_deletable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select baptista.wardrobe_object_readable(p_name);
$$;

create policy baptista_wardrobe_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'baptista-wardrobe' and baptista.wardrobe_object_writable(name));
create policy baptista_wardrobe_select on storage.objects for select to authenticated
  using (bucket_id = 'baptista-wardrobe' and baptista.wardrobe_object_readable(name));
create policy baptista_wardrobe_delete on storage.objects for delete to authenticated
  using (bucket_id = 'baptista-wardrobe' and baptista.wardrobe_object_deletable(name));
-- No update policy: objects are immutable (no upsert, new upload = new key).

revoke execute on function
  baptista.tg_wardrobe_paths(),
  baptista.tg_emit_wardrobe_events(),
  baptista.storage_path_household(text),
  baptista.wardrobe_object_writable(text),
  baptista.wardrobe_object_readable(text),
  baptista.wardrobe_object_deletable(text)
from public, anon;
revoke execute on function baptista.tg_emit_wardrobe_events() from authenticated;
grant execute on function
  baptista.storage_path_household(text),
  baptista.wardrobe_object_writable(text),
  baptista.wardrobe_object_readable(text),
  baptista.wardrobe_object_deletable(text)
to authenticated;
grant execute on all functions in schema baptista to service_role;
