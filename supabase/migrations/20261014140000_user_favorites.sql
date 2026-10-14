-- User favorites: personal bookmarks for navigable features (Phase 05: personalized Home).
-- Each user manages their own favorites independently.

create table baptista.user_favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  feature_id  text not null,
  display_mode text not null default 'quick_link'
    check (display_mode in ('quick_link', 'widget')),
  sort_order  int not null default 0,
  widget_config jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, feature_id)
);

-- Index for fast user queries (RLS filter path).
create index user_favorites_user_idx on baptista.user_favorites (user_id);

-- RLS: users can only see and manage their own favorites.
alter table baptista.user_favorites enable row level security;

create policy "Users read own favorites"
  on baptista.user_favorites for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users insert own favorites"
  on baptista.user_favorites for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users update own favorites"
  on baptista.user_favorites for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users delete own favorites"
  on baptista.user_favorites for delete
  to authenticated
  using (user_id = auth.uid());

-- Column-level grants (Supabase PostgREST needs explicit grants on the baptista schema).
grant select on baptista.user_favorites to authenticated;
grant insert (user_id, feature_id, display_mode, sort_order, widget_config) on baptista.user_favorites to authenticated;
grant update (display_mode, sort_order, widget_config, updated_at) on baptista.user_favorites to authenticated;
grant delete on baptista.user_favorites to authenticated;
