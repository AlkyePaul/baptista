-- Phase 03 — core deterministic domains, events, observations, detectors and ranking.
-- docs/architecture/DATABASE.md (tables, integrity, events), AGENT.md (detectors, ranking),
-- SECURITY.md (visibility, grants). No AI involved anywhere in this file.

-- ---------------------------------------------------------------------------
-- Access predicate shared by every user record
-- private  -> owner is currently an active member
-- household -> any active member
-- (selected_members is reserved and rejected by CHECK constraints until its ACL exists)
-- ---------------------------------------------------------------------------

create function baptista.can_access(p_household_id uuid, p_owner uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select baptista.is_active_member(p_household_id)
     and (p_visibility = 'household' or (p_visibility = 'private' and p_owner = auth.uid()));
$$;

-- Owner/author come from the session, never from the payload; identity fields are immutable and
-- only the owner may change visibility.
create function baptista.tg_record_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.owner_user_id := auth.uid();
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create function baptista.tg_record_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.household_id <> old.household_id
     or new.owner_user_id is distinct from old.owner_user_id
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'immutable_field' using errcode = '42501';
  end if;
  if new.visibility <> old.visibility and auth.uid() is not null
     and old.owner_user_id is distinct from auth.uid() then
    raise exception 'forbidden_visibility_change' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Domain tables
-- ---------------------------------------------------------------------------

create table baptista.calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  all_day boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date, -- exclusive
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check (
    (all_day and start_date is not null and end_date > start_date and starts_at is null and ends_at is null)
    or (not all_day and starts_at is not null and ends_at > starts_at and start_date is null and end_date is null)
  )
);
create index calendar_events_timed_idx on baptista.calendar_events (household_id, starts_at) where not all_day;
create index calendar_events_allday_idx on baptista.calendar_events (household_id, start_date) where all_day;

create table baptista.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  status text not null default 'open' check (status in ('open', 'completed')),
  due_date date,
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check ((status = 'completed') = (completed_at is not null))
);
create index tasks_household_status_idx on baptista.tasks (household_id, status, due_date);

create function baptista.valid_checklist(p_items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_items) = 'array'
     and jsonb_array_length(p_items) <= 200
     and not exists (
       select 1 from jsonb_array_elements(p_items) e
        where jsonb_typeof(e) <> 'object'
           or jsonb_typeof(e -> 'id') <> 'string'
           or jsonb_typeof(e -> 'text') <> 'string'
           or char_length(e ->> 'text') not between 1 and 200
           or jsonb_typeof(e -> 'done') <> 'boolean'
     );
$$;

create table baptista.notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  kind text not null default 'note' check (kind in ('note', 'list')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text check (body is null or char_length(body) <= 10000),
  items jsonb not null default '[]'::jsonb check (baptista.valid_checklist(items)),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create index notes_household_updated_idx on baptista.notes (household_id, updated_at desc);

create table baptista.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  target_value numeric(14, 2) not null check (target_value > 0),
  current_value numeric(14, 2) not null default 0 check (current_value >= 0),
  unit text check (unit is null or char_length(unit) <= 20),
  target_date date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create index goals_household_idx on baptista.goals (household_id, created_at);

create table baptista.habits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  visibility text not null default 'household' check (visibility in ('private', 'household')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  target_per_week integer not null check (target_per_week between 1 and 7),
  active boolean not null default true,
  starts_on date not null default current_date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);
create index habits_household_idx on baptista.habits (household_id, active);

create table baptista.habit_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  habit_id uuid not null,
  performed_on date not null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (household_id, habit_id) references baptista.habits (household_id, id) on delete cascade,
  unique (habit_id, performed_on)
);
create index habit_entries_habit_day_idx on baptista.habit_entries (habit_id, performed_on);

-- Record triggers ------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['calendar_events', 'tasks', 'notes', 'goals', 'habits'] loop
    execute format('create trigger %1$s_insert before insert on baptista.%1$s
                      for each row execute function baptista.tg_record_insert()', t);
    execute format('create trigger %1$s_guard before update on baptista.%1$s
                      for each row execute function baptista.tg_record_update()', t);
    execute format('create trigger %1$s_touch before update on baptista.%1$s
                      for each row execute function baptista.tg_touch()', t);
  end loop;
end;
$$;

create function baptista.tg_task_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status = 'open' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger tasks_status before insert or update on baptista.tasks
  for each row execute function baptista.tg_task_status();

-- Habit entries: author from session, no future days in the household timezone.
create function baptista.tg_habit_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  select timezone into tz from baptista.households where id = new.household_id;
  if new.performed_on > (now() at time zone tz)::date then
    raise exception 'future_entry' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger habit_entries_insert before insert on baptista.habit_entries
  for each row execute function baptista.tg_habit_entry_insert();

-- ---------------------------------------------------------------------------
-- Events (append-oriented, written only by triggers in the same transaction)
-- ---------------------------------------------------------------------------

create table baptista.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  event_type text not null,
  schema_version integer not null default 1,
  source_type text not null,
  source_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  visibility text not null check (visibility in ('private', 'household')),
  owner_user_id uuid references auth.users (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  idempotency_key text not null unique
);
create index events_household_occurred_idx on baptista.events (household_id, occurred_at desc);
create index events_source_idx on baptista.events (source_id);

create function baptista.emit_event(
  p_household_id uuid, p_type text, p_source_type text, p_source_id uuid,
  p_visibility text, p_owner uuid, p_payload jsonb, p_key text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into baptista.events
    (household_id, event_type, source_type, source_id, actor_user_id, visibility, owner_user_id, payload, idempotency_key)
  values
    (p_household_id, p_type, p_source_type, p_source_id, auth.uid(), p_visibility, p_owner, p_payload, p_key)
  on conflict (idempotency_key) do nothing;
$$;

create function baptista.tg_emit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
begin
  -- Nested IFs: each table's fields are only referenced inside its own branch.
  if tg_table_name = 'calendar_events' then
    perform baptista.emit_event(new.household_id, 'calendar.event_created', 'calendar_event', new.id,
      new.visibility, new.owner_user_id, jsonb_build_object('all_day', new.all_day),
      'calendar.event_created:' || new.id);
  elsif tg_table_name = 'tasks' then
    if old.status <> 'completed' and new.status = 'completed' then
      perform baptista.emit_event(new.household_id, 'task.completed', 'task', new.id,
        new.visibility, new.owner_user_id, '{}'::jsonb, 'task.completed:' || new.id || ':' || new.version);
    end if;
  elsif tg_table_name = 'goals' then
    if new.current_value <> old.current_value then
      perform baptista.emit_event(new.household_id, 'goal.progress_changed', 'goal', new.id,
        new.visibility, new.owner_user_id,
        jsonb_build_object('from', old.current_value, 'to', new.current_value, 'target', new.target_value),
        'goal.progress_changed:' || new.id || ':' || new.version);
    end if;
  elsif tg_table_name = 'habit_entries' then
    select visibility, owner_user_id into h from baptista.habits where id = new.habit_id;
    perform baptista.emit_event(new.household_id, 'habit.completed', 'habit', new.habit_id,
      h.visibility, h.owner_user_id, jsonb_build_object('performed_on', new.performed_on),
      'habit.completed:' || new.habit_id || ':' || new.performed_on);
  end if;
  return null;
end;
$$;

create trigger calendar_events_events after insert on baptista.calendar_events
  for each row execute function baptista.tg_emit_events();
create trigger tasks_events after update on baptista.tasks
  for each row execute function baptista.tg_emit_events();
create trigger goals_events after update on baptista.goals
  for each row execute function baptista.tg_emit_events();
create trigger habit_entries_events after insert on baptista.habit_entries
  for each row execute function baptista.tg_emit_events();

-- ---------------------------------------------------------------------------
-- Observations
-- ---------------------------------------------------------------------------

create table baptista.observations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references baptista.households (id) on delete cascade,
  type text not null,
  title text not null,
  description text,
  source_type text not null,
  source_id uuid not null,
  detector_version integer not null,
  dedupe_key text not null,
  visibility text not null check (visibility in ('private', 'household')),
  owner_user_id uuid references auth.users (id) on delete set null,
  audience_key text generated always as (
    case when visibility = 'private' then 'private:' || coalesce(owner_user_id::text, 'none') else 'household' end
  ) stored,
  urgency numeric(4, 3) not null check (urgency between 0 and 1),
  importance numeric(4, 3) not null check (importance between 0 and 1),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  actionability numeric(4, 3) not null check (actionability between 0 and 1),
  priority_score numeric(5, 2) not null check (priority_score between 0 and 100),
  ranking_version integer not null,
  state text not null default 'active' check (state in ('active', 'dismissed', 'resolved', 'expired')),
  data jsonb not null default '{}'::jsonb,
  valid_until timestamptz,
  last_seen_at timestamptz not null,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, audience_key, dedupe_key)
);
create index observations_feed_idx on baptista.observations (household_id, state, priority_score desc);
create index observations_source_idx on baptista.observations (source_id);

create trigger observations_touch before update on baptista.observations
  for each row execute function baptista.tg_touch();

-- Per-household refresh bookkeeping (no client access at all).
create table baptista.observation_refreshes (
  household_id uuid primary key references baptista.households (id) on delete cascade,
  refreshed_at timestamptz not null
);

-- Ranking (AGENT.md). Coefficients live only here; ranking_version tracks changes.
create function baptista.ranking_version()
returns integer language sql immutable set search_path = '' as $$ select 1 $$;

create function baptista.priority_score(
  p_urgency numeric, p_importance numeric, p_confidence numeric, p_actionability numeric,
  p_age_bonus numeric default 0, p_repetition_penalty numeric default 0
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select greatest(0, least(100, round(
    100 * (0.35 * p_urgency + 0.25 * p_importance + 0.20 * p_confidence + 0.20 * p_actionability)
    + least(greatest(p_age_bonus, 0), 5) - least(greatest(p_repetition_penalty, 0), 20), 2)));
$$;

-- Visibility changes and deletions propagate to derived data (never widen the audience).
create function baptista.tg_record_derived()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.visibility <> old.visibility then
      update baptista.events set visibility = new.visibility where source_id = new.id;
      -- Derived observations are recomputed with the new audience on next refresh.
      delete from baptista.observations where source_id = new.id;
    end if;
    return null;
  end if;
  delete from baptista.observations where source_id = old.id;
  update baptista.events set payload = '{}'::jsonb where source_id = old.id;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['calendar_events', 'tasks', 'notes', 'goals', 'habits'] loop
    execute format('create trigger %1$s_derived after update or delete on baptista.%1$s
                      for each row execute function baptista.tg_record_derived()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Detectors (deterministic, explicit clock). detector_version = 1.
-- User-facing text is Italian (D12) and locale-independent: no to_char month/day names.
-- ---------------------------------------------------------------------------

create function baptista.it_day(p_value timestamp)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'])[extract(isodow from p_value)::integer]
         || ' ' || to_char(p_value, 'DD/MM');
$$;

create function baptista.it_number(p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(rtrim(rtrim(to_char(p_value, 'FM999999999990.99'), '0'), '.'), '.', ',');
$$;

create function baptista._refresh_observations(p_household_id uuid, p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  local_now timestamp;
  today date;
  week_start date;
  prev_week_start date;
  week_end_at timestamptz;
  days_left integer;
  rv integer := baptista.ranking_version();
  active_count integer;
begin
  select timezone into tz from baptista.households where id = p_household_id;
  if tz is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  local_now := p_now at time zone tz;
  today := local_now::date;
  week_start := today - (extract(isodow from today)::integer - 1);
  prev_week_start := week_start - 7;
  week_end_at := (week_start + 7)::timestamp at time zone tz;
  days_left := 8 - extract(isodow from today)::integer; -- including today

  with candidates as (
    -- upcomingCalendar: timed events within 24h
    select 'upcoming_calendar'::text as type, e.title,
           'Inizia ' || baptista.it_day(e.starts_at at time zone tz) || ' alle ' || to_char(e.starts_at at time zone tz, 'HH24:MI') as description,
           'calendar_event'::text as source_type, e.id as source_id,
           'upcoming_calendar:' || e.id || ':' || (e.starts_at at time zone tz)::date as dedupe_key,
           e.visibility, e.owner_user_id,
           greatest(0.3, least(1, 1 - extract(epoch from (e.starts_at - p_now)) / 86400.0))::numeric as urgency,
           0.5::numeric as importance, 1::numeric as confidence, 0.4::numeric as actionability,
           e.starts_at as valid_until,
           jsonb_build_object('starts_at', e.starts_at) as data
      from baptista.calendar_events e
     where e.household_id = p_household_id and not e.all_day
       and e.starts_at > p_now and e.starts_at <= p_now + interval '24 hours'
    union all
    -- upcomingCalendar: all-day events today or within the next 24h (local days)
    select 'upcoming_calendar', e.title,
           case when e.start_date <= today then 'Tutto il giorno, oggi' else 'Tutto il giorno, domani' end,
           'calendar_event', e.id,
           'upcoming_calendar:' || e.id || ':' || greatest(e.start_date, today),
           e.visibility, e.owner_user_id,
           case when e.start_date <= today then 0.8 else 0.5 end,
           0.5, 1, 0.4,
           (e.end_date::timestamp at time zone tz),
           jsonb_build_object('start_date', e.start_date, 'end_date', e.end_date)
      from baptista.calendar_events e
     where e.household_id = p_household_id and e.all_day
       and e.start_date <= (local_now + interval '24 hours')::date and e.end_date > today
    union all
    -- overdueTasks: open, due date before local today
    select 'overdue_task', 'In ritardo: ' || t.title,
           'Scadeva ' || baptista.it_day(t.due_date) || ' (' || (today - t.due_date)
             || case when today - t.due_date = 1 then ' giorno fa)' else ' giorni fa)' end,
           'task', t.id, 'overdue_task:' || t.id || ':' || t.due_date,
           t.visibility, t.owner_user_id,
           least(1, 0.6 + 0.05 * (today - t.due_date)), 0.6, 1, 1,
           null::timestamptz,
           jsonb_build_object('due_date', t.due_date, 'days_overdue', today - t.due_date)
      from baptista.tasks t
     where t.household_id = p_household_id and t.status = 'open' and t.due_date < today
    union all
    -- missedHabits: the concluded week ended under target (only what was recorded)
    select 'missed_habit', h.title || ': ' || coalesce(c.n, 0) || ' su ' || h.target_per_week || ' registrate la settimana scorsa',
           'Conta solo le registrazioni. Se l''hai fatto senza registrarlo, puoi ancora aggiungerlo.',
           'habit', h.id, 'missed_habit:' || h.id || ':' || prev_week_start,
           h.visibility, h.owner_user_id,
           0.3, 0.4, 0.6, 0.3,
           week_end_at,
           jsonb_build_object('week_start', prev_week_start, 'logged', coalesce(c.n, 0), 'target', h.target_per_week)
      from baptista.habits h
      left join lateral (
        select count(*)::integer as n from baptista.habit_entries x
         where x.habit_id = h.id and x.performed_on >= prev_week_start and x.performed_on < week_start
      ) c on true
     where h.household_id = p_household_id and h.active and h.starts_on <= prev_week_start
       and coalesce(c.n, 0) < h.target_per_week
    union all
    -- habitProgress: current week count and remaining
    select 'habit_progress', h.title || ': ' || coalesce(c.n, 0) || '/' || h.target_per_week || ' questa settimana',
           'Ne mancano ' || (h.target_per_week - coalesce(c.n, 0)) || ', '
             || case when days_left = 1 then 'resta 1 giorno' else 'restano ' || days_left || ' giorni' end,
           'habit', h.id, 'habit_progress:' || h.id || ':' || week_start,
           h.visibility, h.owner_user_id,
           least(1, (h.target_per_week - coalesce(c.n, 0))::numeric / days_left), 0.4, 1, 0.8,
           week_end_at,
           jsonb_build_object('week_start', week_start, 'logged', coalesce(c.n, 0), 'target', h.target_per_week,
                              'days_left', days_left)
      from baptista.habits h
      left join lateral (
        select count(*)::integer as n from baptista.habit_entries x
         where x.habit_id = h.id and x.performed_on >= week_start and x.performed_on <= today
      ) c on true
     where h.household_id = p_household_id and h.active and h.starts_on <= today
       and coalesce(c.n, 0) < h.target_per_week
    union all
    -- goalProgress: reacts to a recorded change in the last 24h (one per goal per local day)
    select 'goal_progress',
           g.title || ': ' || least(100, floor(100 * g.current_value / g.target_value))::integer || '%',
           trim(baptista.it_number(g.current_value) || ' / ' || baptista.it_number(g.target_value)
             || ' ' || coalesce(g.unit, '')),
           'goal', g.id, 'goal_progress:' || g.id || ':' || (ev.occurred_at at time zone tz)::date,
           g.visibility, g.owner_user_id,
           0.2, 0.5, 1, 0.2,
           ev.occurred_at + interval '24 hours',
           jsonb_build_object('current', g.current_value, 'target', g.target_value, 'unit', g.unit)
      from baptista.goals g
      join lateral (
        select max(occurred_at) as occurred_at from baptista.events v
         where v.source_id = g.id and v.event_type = 'goal.progress_changed'
      ) ev on ev.occurred_at is not null and ev.occurred_at > p_now - interval '24 hours'
     where g.household_id = p_household_id
  )
  insert into baptista.observations as o (
    household_id, type, title, description, source_type, source_id, detector_version, dedupe_key,
    visibility, owner_user_id, urgency, importance, confidence, actionability, priority_score,
    ranking_version, state, data, valid_until, last_seen_at
  )
  select p_household_id, c.type, c.title, c.description, c.source_type, c.source_id, 1, c.dedupe_key,
         c.visibility, c.owner_user_id, round(c.urgency, 3), c.importance, c.confidence, c.actionability,
         baptista.priority_score(c.urgency, c.importance, c.confidence, c.actionability),
         rv, 'active', c.data, c.valid_until, p_now
    from candidates c
  on conflict (household_id, audience_key, dedupe_key) do update
     set title = excluded.title,
         description = excluded.description,
         urgency = excluded.urgency,
         importance = excluded.importance,
         confidence = excluded.confidence,
         actionability = excluded.actionability,
         priority_score = excluded.priority_score,
         ranking_version = excluded.ranking_version,
         data = excluded.data,
         valid_until = excluded.valid_until,
         last_seen_at = excluded.last_seen_at,
         state = case when o.state = 'dismissed' then 'dismissed' else 'active' end,
         resolved_at = case when o.state = 'dismissed' then o.resolved_at else null end;

  -- Situations no longer true are resolved; past windows expire.
  update baptista.observations
     set state = 'resolved', resolved_at = p_now
   where household_id = p_household_id and state = 'active' and last_seen_at < p_now;

  update baptista.observations
     set state = 'expired'
   where household_id = p_household_id and state in ('active', 'dismissed')
     and valid_until is not null and valid_until <= p_now;

  insert into baptista.observation_refreshes (household_id, refreshed_at)
  values (p_household_id, p_now)
  on conflict (household_id) do update set refreshed_at = excluded.refreshed_at;

  select count(*) into active_count from baptista.observations
   where household_id = p_household_id and state = 'active';
  return active_count;
end;
$$;

-- On-demand refresh for a member: serialized per household and throttled (30s).
create function baptista.refresh_observations(p_household_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_at timestamptz;
begin
  perform baptista.require_uid();
  if not baptista.is_active_member(p_household_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('baptista.refresh:' || p_household_id, 0));
  select refreshed_at into last_at from baptista.observation_refreshes where household_id = p_household_id;
  if last_at is not null and last_at > now() - interval '30 seconds' then
    return false;
  end if;
  perform baptista._refresh_observations(p_household_id, now());
  return true;
end;
$$;

-- Manual dismissal: a user gesture on a situation the caller can read.
create function baptista.dismiss_observation(p_observation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  perform baptista.require_uid();
  select household_id, owner_user_id, visibility into o
    from baptista.observations where id = p_observation_id;
  if not found or not baptista.can_access(o.household_id, o.owner_user_id, o.visibility) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update baptista.observations
     set state = 'dismissed', dismissed_at = now(), dismissed_by = auth.uid()
   where id = p_observation_id and state = 'active';
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['calendar_events', 'tasks', 'notes', 'goals', 'habits'] loop
    execute format('alter table baptista.%s enable row level security', t);
    execute format('create policy %1$s_select on baptista.%1$s for select to authenticated
                      using (baptista.can_access(household_id, owner_user_id, visibility))', t);
    execute format('create policy %1$s_insert on baptista.%1$s for insert to authenticated
                      with check (owner_user_id = (select auth.uid())
                                  and baptista.can_access(household_id, owner_user_id, visibility))', t);
    execute format('create policy %1$s_update on baptista.%1$s for update to authenticated
                      using (baptista.can_access(household_id, owner_user_id, visibility))
                      with check (baptista.can_access(household_id, owner_user_id, visibility))', t);
    execute format('create policy %1$s_delete on baptista.%1$s for delete to authenticated
                      using (baptista.can_access(household_id, owner_user_id, visibility))', t);
  end loop;
end;
$$;

alter table baptista.habit_entries enable row level security;
create policy habit_entries_select on baptista.habit_entries for select to authenticated
  using (exists (select 1 from baptista.habits h where h.id = habit_id and h.household_id = habit_entries.household_id));
create policy habit_entries_insert on baptista.habit_entries for insert to authenticated
  with check (exists (select 1 from baptista.habits h where h.id = habit_id and h.household_id = habit_entries.household_id));
create policy habit_entries_delete on baptista.habit_entries for delete to authenticated
  using (exists (select 1 from baptista.habits h where h.id = habit_id and h.household_id = habit_entries.household_id));

alter table baptista.events enable row level security;
create policy events_select on baptista.events for select to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));

alter table baptista.observations enable row level security;
create policy observations_select on baptista.observations for select to authenticated
  using (baptista.can_access(household_id, owner_user_id, visibility));

alter table baptista.observation_refreshes enable row level security;

-- ---------------------------------------------------------------------------
-- Grants: identity columns never updatable; events/observations read-only for clients.
-- ---------------------------------------------------------------------------

revoke all on
  baptista.calendar_events, baptista.tasks, baptista.notes, baptista.goals, baptista.habits,
  baptista.habit_entries, baptista.events, baptista.observations, baptista.observation_refreshes
from public, anon, authenticated;

grant select, delete on baptista.calendar_events, baptista.tasks, baptista.notes, baptista.goals, baptista.habits
  to authenticated;

grant insert (household_id, visibility, title, description, all_day, starts_at, ends_at, start_date, end_date),
      update (visibility, title, description, all_day, starts_at, ends_at, start_date, end_date)
  on baptista.calendar_events to authenticated;
grant insert (household_id, visibility, title, notes, status, due_date),
      update (visibility, title, notes, status, due_date)
  on baptista.tasks to authenticated;
grant insert (household_id, visibility, kind, title, body, items),
      update (visibility, kind, title, body, items)
  on baptista.notes to authenticated;
grant insert (household_id, visibility, title, target_value, current_value, unit, target_date),
      update (visibility, title, target_value, current_value, unit, target_date)
  on baptista.goals to authenticated;
grant insert (household_id, visibility, title, target_per_week, active, starts_on),
      update (visibility, title, target_per_week, active, starts_on)
  on baptista.habits to authenticated;

grant select, delete on baptista.habit_entries to authenticated;
grant insert (household_id, habit_id, performed_on) on baptista.habit_entries to authenticated;

grant select on baptista.events, baptista.observations to authenticated;

grant all on
  baptista.calendar_events, baptista.tasks, baptista.notes, baptista.goals, baptista.habits,
  baptista.habit_entries, baptista.events, baptista.observations, baptista.observation_refreshes
to service_role;

revoke execute on all functions in schema baptista from public, anon;
grant execute on function
  baptista.can_access(uuid, uuid, text),
  baptista.valid_checklist(jsonb),
  baptista.refresh_observations(uuid),
  baptista.dismiss_observation(uuid),
  baptista.priority_score(numeric, numeric, numeric, numeric, numeric, numeric),
  baptista.ranking_version()
to authenticated;
grant execute on all functions in schema baptista to service_role;
