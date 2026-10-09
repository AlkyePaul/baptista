-- Goals can go up (run 100 km) or down (lose weight 85 -> 70 kg). Progress was computed as
-- current / target, which reported a decreasing goal as completed. A goal now has a start value;
-- progress = (current - start) / (target - start), clamped to [0, 100]. Single SQL definition,
-- mirrored by lib/goals.ts (same formula, tested on both sides).

alter table baptista.goals add column start_value numeric(14, 2);

-- Backfill: a goal whose current value is above its target was a decreasing goal started at the
-- current value; every other goal started from zero (the previous implicit baseline).
update baptista.goals
   set start_value = case when current_value > target_value then current_value else 0 end;

alter table baptista.goals
  alter column start_value set not null,
  alter column start_value set default 0,
  add constraint goals_start_value_check check (start_value >= 0),
  add constraint goals_target_differs_check check (target_value <> start_value);

create function baptista.goal_percent(p_start numeric, p_current numeric, p_target numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_target = p_start then 0
    else greatest(0, least(100, floor(100 * (p_current - p_start) / (p_target - p_start))))::integer
  end;
$$;

grant insert (start_value), update (start_value) on baptista.goals to authenticated;
grant execute on function baptista.goal_percent(numeric, numeric, numeric) to authenticated;

-- Event payload carries the baseline so history stays interpretable.
create or replace function baptista.tg_emit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
begin
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
        jsonb_build_object('from', old.current_value, 'to', new.current_value,
                           'start', new.start_value, 'target', new.target_value),
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

-- Detector: goal progress uses the shared formula and states start -> target.
create or replace function baptista._refresh_observations(p_household_id uuid, p_now timestamptz)
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
  days_left := 8 - extract(isodow from today)::integer;

  with candidates as (
    select 'upcoming_calendar'::text as type, e.title,
           'Inizia ' || baptista.it_day(e.starts_at at time zone tz) || ' alle ' || to_char(e.starts_at at time zone tz, 'HH24:MI') as description,
           'calendar_event'::text as source_type, e.id as source_id,
           'upcoming_calendar:' || e.id || ':' || (e.starts_at at time zone tz)::date as dedupe_key,
           e.visibility, e.owner_user_id,
           greatest(0.3, least(1, 1 - extract(epoch from (e.starts_at - p_now)) / 86400.0))::numeric as urgency,
           0.5::numeric as importance, 1::numeric as confidence, 0.4::numeric as actionability,
           e.starts_at as valid_until,
           jsonb_build_object('starts_at', e.starts_at, 'all_day', false) as data
      from baptista.calendar_events e
     where e.household_id = p_household_id and not e.all_day
       and e.starts_at > p_now and e.starts_at <= p_now + interval '24 hours'
    union all
    select 'upcoming_calendar', e.title,
           case when e.start_date <= today then 'Tutto il giorno, oggi' else 'Tutto il giorno, domani' end,
           'calendar_event', e.id,
           'upcoming_calendar:' || e.id || ':' || greatest(e.start_date, today),
           e.visibility, e.owner_user_id,
           case when e.start_date <= today then 0.8 else 0.5 end,
           0.5, 1, 0.4,
           (e.end_date::timestamp at time zone tz),
           jsonb_build_object('start_date', greatest(e.start_date, today), 'end_date', e.end_date, 'all_day', true)
      from baptista.calendar_events e
     where e.household_id = p_household_id and e.all_day
       and e.start_date <= (local_now + interval '24 hours')::date and e.end_date > today
    union all
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
    select 'goal_progress',
           g.title || ': ' || baptista.goal_percent(g.start_value, g.current_value, g.target_value) || '%',
           trim('da ' || baptista.it_number(g.start_value) || ' a ' || baptista.it_number(g.target_value)
             || coalesce(' ' || g.unit, '') || ', ora ' || baptista.it_number(g.current_value)),
           'goal', g.id, 'goal_progress:' || g.id || ':' || (ev.occurred_at at time zone tz)::date,
           g.visibility, g.owner_user_id,
           0.2, 0.5, 1, 0.2,
           ev.occurred_at + interval '24 hours',
           jsonb_build_object('start', g.start_value, 'current', g.current_value, 'target', g.target_value,
                              'unit', g.unit,
                              'percent', baptista.goal_percent(g.start_value, g.current_value, g.target_value))
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
  select p_household_id, c.type, c.title, c.description, c.source_type, c.source_id, 2, c.dedupe_key,
         c.visibility, c.owner_user_id, round(c.urgency, 3), c.importance, c.confidence, c.actionability,
         baptista.priority_score(c.urgency, c.importance, c.confidence, c.actionability),
         rv, 'active', c.data, c.valid_until, p_now
    from candidates c
  on conflict (household_id, audience_key, dedupe_key) do update
     set title = excluded.title,
         description = excluded.description,
         detector_version = excluded.detector_version,
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

revoke execute on function baptista._refresh_observations(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function baptista.tg_emit_events() from public, anon, authenticated;
