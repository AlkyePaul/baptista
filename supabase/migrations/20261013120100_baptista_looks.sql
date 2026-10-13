-- Phase 05 — Looks (flat-lay outfit builder): a look is a collection of wardrobe items
-- with 2D placement data (x, y, scale, rotation, z_order).

-- ---------------------------------------------------------------------------
-- Looks
-- ---------------------------------------------------------------------------

create table baptista.looks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  preview_path text check (preview_path is null or preview_path like household_id::text || '/%'),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  seasons text[] not null default '{}' check (seasons <@ array['spring', 'summer', 'autumn', 'winter']),
  formality text check (formality is null or formality in ('casual', 'smart', 'formal', 'sport')),
  status text not null default 'active' check (status in ('active', 'archived')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);

create index looks_household_idx on baptista.looks (household_id, status);

do $$
begin
  create trigger looks_insert before insert on baptista.looks
    for each row execute function baptista.tg_record_insert();
  create trigger looks_guard before update on baptista.looks
    for each row execute function baptista.tg_record_update();
  create trigger looks_touch before update on baptista.looks
    for each row execute function baptista.tg_touch();
  create trigger looks_derived after update or delete on baptista.looks
    for each row execute function baptista.tg_record_derived();
end;
$$;

alter table baptista.looks enable row level security;
create policy looks_select on baptista.looks for select to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));
create policy looks_insert on baptista.looks for insert to authenticated
  with check (owner_user_id = (select auth.uid()) and baptista.can_access(household_id, owner_user_id, visibility));
create policy looks_update on baptista.looks for update to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility))
  with check (baptista.can_access(household_id, owner_user_id, visibility));
create policy looks_delete on baptista.looks for delete to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));

revoke all on baptista.looks from public, anon, authenticated;
grant select, delete on baptista.looks to authenticated;
grant insert (id, household_id, visibility, title, notes, preview_path, tags, seasons, formality, status),
      update (visibility, title, notes, preview_path, tags, seasons, formality, status)
  on baptista.looks to authenticated;
grant all on baptista.looks to service_role;

-- ---------------------------------------------------------------------------
-- Look items (placement of wardrobe items in a look)
-- ---------------------------------------------------------------------------

create table baptista.look_items (
  id uuid primary key default gen_random_uuid(),
  look_id uuid not null references baptista.looks (id) on delete cascade,
  wardrobe_item_id uuid not null references baptista.wardrobe_items (id) on delete cascade,
  x numeric not null default 0.5 check (x >= 0 and x <= 1),
  y numeric not null default 0.5 check (y >= 0 and y <= 1),
  scale numeric not null default 1.0 check (scale >= 0.1 and scale <= 3.0),
  rotation numeric not null default 0 check (rotation >= -360 and rotation <= 360),
  z_order integer not null default 0
);

create index look_items_look_idx on baptista.look_items (look_id);
create index look_items_wardrobe_item_idx on baptista.look_items (wardrobe_item_id);

-- RLS: inherited from parent look via a join.
alter table baptista.look_items enable row level security;

create policy look_items_select on baptista.look_items for select to authenticated
  using (exists (
    select 1 from baptista.looks l
    where l.id = look_id
      and baptista.can_access(l.household_id, l.owner_user_id, l.visibility)
  ));
create policy look_items_insert on baptista.look_items for insert to authenticated
  with check (exists (
    select 1 from baptista.looks l
    where l.id = look_id
      and baptista.can_access(l.household_id, l.owner_user_id, l.visibility)
  ));
create policy look_items_update on baptista.look_items for update to authenticated
  using (exists (
    select 1 from baptista.looks l
    where l.id = look_id
      and baptista.can_access(l.household_id, l.owner_user_id, l.visibility)
  ));
create policy look_items_delete on baptista.look_items for delete to authenticated
  using (exists (
    select 1 from baptista.looks l
    where l.id = look_id
      and baptista.can_access(l.household_id, l.owner_user_id, l.visibility)
  ));

revoke all on baptista.look_items from public, anon, authenticated;
grant select, delete on baptista.look_items to authenticated;
grant insert (look_id, wardrobe_item_id, x, y, scale, rotation, z_order),
      update (x, y, scale, rotation, z_order)
  on baptista.look_items to authenticated;
grant all on baptista.look_items to service_role;

-- Storage: look preview images use the same baptista-wardrobe bucket.
-- The existing storage policies already cover reads/writes/deletes via the wardrobe functions
-- since the path structure is <household>/<user>/<uuid>/preview.jpg (same 4-segment pattern).
