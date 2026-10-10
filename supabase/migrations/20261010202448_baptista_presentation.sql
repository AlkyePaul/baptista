-- Phase 04.1 step B — Baptista presentation memory (D30, B-4). Per viewer and private to them:
-- what Baptista already said, how the viewer answered, personal snoozes and «Ora no». The
-- observation's own state stays about facts (active/resolved/expired); dismissing a card in
-- Baptista is personal. No AI anywhere.

create table baptista.baptista_presentations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 'obs:<dedupe_key>' (stable when the observation is regenerated) or 'daily:<YYYY-MM-DD>'.
  key text not null check (char_length(key) between 1 and 300),
  observation_id uuid references baptista.observations (id) on delete set null,
  first_shown_at timestamptz not null default now(),
  last_shown_at timestamptz not null default now(),
  show_count integer not null default 1 check (show_count between 1 and 100000),
  last_variant text check (last_variant is null or char_length(last_variant) <= 80),
  outcome text not null default 'shown'
    check (outcome in ('shown', 'answered', 'acted', 'snoozed', 'dismissed', 'failed')),
  snoozed_until timestamptz,
  script_step text check (script_step is null or char_length(script_step) <= 60),
  -- Short confirmation shown in «Fatto di recente» (Italian template text, no user secrets).
  result_text text check (result_text is null or char_length(result_text) <= 300),
  updated_at timestamptz not null default now(),
  unique (household_id, user_id, key)
);
create index baptista_presentations_user_idx on baptista.baptista_presentations (user_id, household_id, last_shown_at desc);

create trigger baptista_presentations_touch before update on baptista.baptista_presentations
  for each row execute function baptista.tg_touch();

-- One write path: a shown message is counted at most once every 4 hours (not at every render);
-- an outcome, snooze or step is kept until replaced. Caller's privileges (RLS self-only).
create function baptista.record_presentation(
  p_household_id uuid, p_key text, p_observation_id uuid default null, p_variant text default null,
  p_outcome text default null, p_snoozed_until timestamptz default null, p_step text default null,
  p_result_text text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not baptista.is_active_member(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into baptista.baptista_presentations as p
    (household_id, key, observation_id, last_variant, outcome, snoozed_until, script_step, result_text)
  values (p_household_id, p_key, p_observation_id, p_variant, coalesce(p_outcome, 'shown'), p_snoozed_until,
          p_step, p_result_text)
  on conflict (household_id, user_id, key) do update
     set observation_id = coalesce(excluded.observation_id, p.observation_id),
         show_count = case when p.last_shown_at < now() - interval '4 hours' then p.show_count + 1 else p.show_count end,
         last_shown_at = case when p_outcome is null then now() else p.last_shown_at end,
         last_variant = coalesce(p_variant, p.last_variant),
         outcome = coalesce(p_outcome, p.outcome),
         snoozed_until = case when p_outcome is null then p.snoozed_until else p_snoozed_until end,
         script_step = coalesce(p_step, p.script_step),
         result_text = coalesce(p_result_text, p.result_text);
end;
$$;

alter table baptista.baptista_presentations enable row level security;
create policy baptista_presentations_select on baptista.baptista_presentations for select to authenticated
  using (user_id = (select auth.uid()) and baptista.is_active_member(household_id));
create policy baptista_presentations_insert on baptista.baptista_presentations for insert to authenticated
  with check (user_id = (select auth.uid()) and baptista.is_active_member(household_id));
create policy baptista_presentations_update on baptista.baptista_presentations for update to authenticated
  using (user_id = (select auth.uid()) and baptista.is_active_member(household_id))
  with check (user_id = (select auth.uid()) and baptista.is_active_member(household_id));
create policy baptista_presentations_delete on baptista.baptista_presentations for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on baptista.baptista_presentations from public, anon, authenticated;
grant select, delete on baptista.baptista_presentations to authenticated;
grant insert (household_id, key, observation_id, last_variant, outcome, snoozed_until, script_step, result_text),
      update (observation_id, last_shown_at, show_count, last_variant, outcome, snoozed_until, script_step, result_text)
  on baptista.baptista_presentations to authenticated;
grant all on baptista.baptista_presentations to service_role;

revoke execute on function
  baptista.record_presentation(uuid, text, uuid, text, text, timestamptz, text, text)
from public, anon;
grant execute on function
  baptista.record_presentation(uuid, text, uuid, text, text, timestamptz, text, text)
to authenticated;
grant execute on all functions in schema baptista to service_role;
