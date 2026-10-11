import { strict as assert } from "node:assert";
import { before, describe, test } from "node:test";
import { as, createDb, createUser, rejects, type Db } from "./harness";

type User = { id: string; email: string };

let db: Db;
let owner: User; // Anna: owner of household H1
let member: User; // Bruno: active member of H1
let stranger: User; // Carla: owner of H2, never in H1
let pending: User; // Dario: invited to H1, not accepted
let noProfile: User; // Auth user without a Baptista profile
let h1: string;
let h2: string;

async function createHousehold(user: User, name: string, tz = "Europe/Rome") {
  const [row] = await as(db, user, (q) =>
    q<{ id: string }>("select baptista.create_household($1, $2) as id", [name, tz]),
  );
  return row.id;
}

async function count(user: User | "anon", sql: string, params: unknown[] = []) {
  const [row] = await as(db, user, (q) => q<{ n: number }>(`select count(*)::int as n from (${sql}) s`, params));
  return row.n;
}

before(async () => {
  db = await createDb();
  owner = await createUser(db, "Anna");
  member = await createUser(db, "Bruno");
  stranger = await createUser(db, "Carla");
  pending = await createUser(db, "Dario");
  noProfile = await createUser(db, "Ezio", false);

  h1 = await createHousehold(owner, "Casa Rossi");
  h2 = await createHousehold(stranger, "Casa Bianchi");
  await as(db, owner, (q) => q("select baptista.invite_member($1, $2)", [h1, member.email]));
  await as(db, member, (q) => q("select baptista.respond_to_invite($1, true)", [h1]));
  await as(db, owner, (q) => q("select baptista.invite_member($1, $2)", [h1, pending.email]));
});

describe("phase 01 — households and membership", () => {
  test("no baptista function or table privilege is granted to anon/public", async () => {
    const rows = await as(db, "admin", (q) =>
      q<{ name: string }>(
        `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'baptista' and has_function_privilege('anon', p.oid, 'EXECUTE')
         union all
         select table_name from information_schema.role_table_grants
          where table_schema = 'baptista' and grantee in ('anon', 'PUBLIC')`,
      ),
    );
    assert.deepEqual(rows.map((r) => r.name), []);
  });

  test("anon has no access to the schema", async () => {
    await rejects(as(db, "anon", (q) => q("select * from baptista.households")), /permission denied/);
    await rejects(as(db, "anon", (q) => q("select baptista.create_household('x', 'Europe/Rome')")), /permission denied/);
  });

  test("bootstrap creates the owner membership atomically", async () => {
    const rows = await as(db, owner, (q) =>
      q<{ role: string; state: string }>(
        "select role, state from baptista.household_members where household_id = $1 and user_id = $2",
        [h1, owner.id],
      ),
    );
    assert.deepEqual(rows, [{ role: "owner", state: "active" }]);
  });

  test("bootstrap requires a Baptista profile and a valid timezone", async () => {
    await rejects(createHousehold(noProfile, "Senza profilo"), /profile_required/);
    await rejects(createHousehold(owner, "Fuso errato", "Mars/Olympus"), /invalid_timezone/);
  });

  test("strangers cannot see other households or memberships", async () => {
    assert.equal(await count(stranger, "select * from baptista.households where id = $1", [h1]), 0);
    assert.equal(await count(stranger, "select * from baptista.household_members where household_id = $1", [h1]), 0);
    assert.equal(await count(stranger, "select * from baptista.household_directory($1)", [h1]), 0);
  });

  test("pending invitee sees the household name but no members or records", async () => {
    assert.equal(await count(pending, "select * from baptista.households where id = $1", [h1]), 1);
    assert.equal(
      await count(pending, "select * from baptista.household_members where household_id = $1 and user_id <> $2", [h1, pending.id]),
      0,
    );
  });

  test("clients cannot write memberships or households directly", async () => {
    await rejects(
      as(db, member, (q) => q("update baptista.household_members set role = 'owner' where user_id = $1", [member.id])),
      /permission denied/,
    );
    await rejects(
      as(db, stranger, (q) =>
        q("insert into baptista.household_members (household_id, user_id, role, state) values ($1, $2, 'owner', 'active')", [h1, stranger.id]),
      ),
      /permission denied/,
    );
    await rejects(as(db, owner, (q) => q("update baptista.households set name = 'x' where id = $1", [h1])), /permission denied/);
  });

  test("only owners invite; self and current members are refused", async () => {
    await rejects(as(db, member, (q) => q("select baptista.invite_member($1, $2)", [h1, stranger.email])), /forbidden/);
    await rejects(as(db, owner, (q) => q("select baptista.invite_member($1, $2)", [h1, owner.email])), /invite_unavailable/);
    await rejects(as(db, owner, (q) => q("select baptista.invite_member($1, $2)", [h1, member.email])), /invite_unavailable/);
    await rejects(as(db, owner, (q) => q("select baptista.invite_member($1, 'non-una-email')", [h1])), /invalid/);
  });

  test("profiles are self-only; the directory exposes only name and avatar to members", async () => {
    assert.equal(await count(member, "select * from baptista.profiles where user_id = $1", [owner.id]), 0);
    const dir = await as(db, member, (q) =>
      q<{ display_name: string }>("select display_name from baptista.household_directory($1) where state = 'active'", [h1]),
    );
    assert.deepEqual(dir.map((d) => d.display_name).sort(), ["Anna", "Bruno"]);
  });

  test("household updates are owner-only and version-checked", async () => {
    await rejects(
      as(db, member, (q) => q("select baptista.update_household($1, 'x', 'Europe/Rome', 1)", [h1])),
      /forbidden/,
    );
    await as(db, owner, (q) => q("select baptista.update_household($1, 'Casa Rossi', 'Europe/Rome', 1)", [h1]));
    await rejects(
      as(db, owner, (q) => q("select baptista.update_household($1, 'Vecchia', 'Europe/Rome', 1)", [h1])),
      /conflict/,
    );
  });

  test("an owner cannot leave other members behind; transfer then leave works", async () => {
    const solo = await createUser(db, "Solo");
    const hs = await createHousehold(solo, "Casa Solo");
    const helper = await createUser(db, "Aiuto");
    await as(db, solo, (q) => q("select baptista.invite_member($1, $2)", [hs, helper.email]));
    await rejects(
      as(db, solo, (q) => q("select baptista.transfer_ownership($1, $2)", [hs, helper.id])),
      /not_found/, // pending members cannot become owners
    );
    await as(db, helper, (q) => q("select baptista.respond_to_invite($1, true)", [hs]));
    await rejects(as(db, solo, (q) => q("select baptista.remove_member($1, $2)", [hs, solo.id])), /last_owner/);
    await as(db, solo, (q) => q("select baptista.transfer_ownership($1, $2)", [hs, helper.id]));
    await as(db, solo, (q) => q("select baptista.remove_member($1, $2)", [hs, solo.id]));
    assert.equal(await count(solo, "select * from baptista.households where id = $1", [hs]), 0);
    assert.equal(await count(helper, "select * from baptista.households where id = $1", [hs]), 1);
  });
});

describe("phase 03 — records, visibility and integrity", () => {
  test("household records are shared, private records are not", async () => {
    await as(db, owner, (q) =>
      q("insert into baptista.tasks (household_id, title, visibility) values ($1, 'Comprare il pane', 'household'), ($1, 'Regalo per Bruno', 'private')", [h1]),
    );
    assert.equal(await count(member, "select * from baptista.tasks where household_id = $1", [h1]), 1);
    assert.equal(await count(owner, "select * from baptista.tasks where household_id = $1", [h1]), 2);
    assert.equal(await count(stranger, "select * from baptista.tasks where household_id = $1", [h1]), 0);
    assert.equal(await count(pending, "select * from baptista.tasks where household_id = $1", [h1]), 0);
  });

  test("owner and author come from the session and cannot be forged or reassigned", async () => {
    await rejects(
      as(db, member, (q) => q("insert into baptista.tasks (household_id, title, owner_user_id) values ($1, 'x', $2)", [h1, owner.id])),
      /permission denied/,
    );
    const [row] = await as(db, member, (q) =>
      q<{ owner_user_id: string; created_by: string }>(
        "insert into baptista.tasks (household_id, title) values ($1, 'Annaffiare') returning owner_user_id, created_by",
        [h1],
      ),
    );
    assert.equal(row.owner_user_id, member.id);
    assert.equal(row.created_by, member.id);
    await rejects(
      as(db, member, (q) => q("update baptista.tasks set household_id = $1 where household_id = $2", [h2, h1])),
      /permission denied/,
    );
  });

  test("no writes into another household", async () => {
    await rejects(
      as(db, stranger, (q) => q("insert into baptista.tasks (household_id, title) values ($1, 'intruso')", [h1])),
      /row-level security/,
    );
    await rejects(
      as(db, member, (q) => q("insert into baptista.tasks (household_id, title) values ($1, 'intruso')", [h2])),
      /row-level security/,
    );
  });

  test("only the record owner changes visibility", async () => {
    await rejects(
      as(db, member, (q) =>
        q("update baptista.tasks set visibility = 'private' where household_id = $1 and title = 'Comprare il pane'", [h1]),
      ),
      /forbidden_visibility_change/,
    );
  });

  test("domain constraints", async () => {
    await rejects(
      as(db, owner, (q) =>
        q("insert into baptista.calendar_events (household_id, title, starts_at, ends_at) values ($1, 'x', '2026-10-10 10:00Z', '2026-10-10 09:00Z')", [h1]),
      ),
      /check constraint/,
    );
    await rejects(
      as(db, owner, (q) =>
        q("insert into baptista.calendar_events (household_id, title, all_day, start_date, end_date) values ($1, 'x', true, '2026-10-10', '2026-10-10')", [h1]),
      ),
      /check constraint/,
    );
    await rejects(
      as(db, owner, (q) => q("insert into baptista.goals (household_id, title, target_value) values ($1, 'x', 0)", [h1])),
      /check constraint/,
    );
    for (const target of [0, 8]) {
      await rejects(
        as(db, owner, (q) => q("insert into baptista.habits (household_id, title, target_per_week) values ($1, 'x', $2)", [h1, target])),
        /check constraint/,
      );
    }
    await as(db, owner, (q) =>
      q("insert into baptista.habits (household_id, title, target_per_week) values ($1, 'uno', 1), ($1, 'sette', 7)", [h1]),
      { commit: false },
    );
    await rejects(
      as(db, owner, (q) =>
        q(`insert into baptista.notes (household_id, title, kind, items) values ($1, 'x', 'list', '[{"id":"1","text":"","done":false}]')`, [h1]),
      ),
      /check constraint/,
    );
  });

  test("habit entries: one per day, never in the future", async () => {
    const [habit] = await as(db, member, (q) =>
      q<{ id: string }>("insert into baptista.habits (household_id, title, target_per_week, starts_on) values ($1, 'Corsa', 3, '2026-01-01') returning id", [h1]),
    );
    await as(db, member, (q) =>
      q("insert into baptista.habit_entries (household_id, habit_id, performed_on) values ($1, $2, current_date - 1)", [h1, habit.id]),
    );
    await rejects(
      as(db, owner, (q) =>
        q("insert into baptista.habit_entries (household_id, habit_id, performed_on) values ($1, $2, current_date - 1)", [h1, habit.id]),
      ),
      /duplicate key/,
    );
    await rejects(
      as(db, member, (q) =>
        q("insert into baptista.habit_entries (household_id, habit_id, performed_on) values ($1, $2, current_date + 2)", [h1, habit.id]),
      ),
      /future_entry/,
    );
    await rejects(
      as(db, stranger, (q) =>
        q("insert into baptista.habit_entries (household_id, habit_id, performed_on) values ($1, $2, current_date)", [h1, habit.id]),
      ),
      /row-level security/,
    );
  });

  test("events are written atomically by the database, never by clients", async () => {
    const [task] = await as(db, owner, (q) =>
      q<{ id: string }>("insert into baptista.tasks (household_id, title) values ($1, 'Pagare bolletta') returning id", [h1]),
    );
    await as(db, owner, (q) => q("update baptista.tasks set status = 'completed' where id = $1", [task.id]));
    await as(db, owner, (q) => q("update baptista.tasks set title = 'Pagare la bolletta' where id = $1", [task.id]));
    assert.equal(await count(owner, "select * from baptista.events where source_id = $1 and event_type = 'task.completed'", [task.id]), 1);

    // Reopen and complete again: a new fact, a new event.
    await as(db, owner, (q) => q("update baptista.tasks set status = 'open' where id = $1", [task.id]));
    await as(db, owner, (q) => q("update baptista.tasks set status = 'completed' where id = $1", [task.id]));
    assert.equal(await count(owner, "select * from baptista.events where source_id = $1 and event_type = 'task.completed'", [task.id]), 2);

    // Rolled-back mutation leaves no event.
    await as(db, owner, (q) =>
      q("insert into baptista.calendar_events (household_id, title, starts_at, ends_at) values ($1, 'Annullato', now() + interval '1 day', now() + interval '1 day 1 hour')", [h1]),
      { commit: false },
    );
    assert.equal(await count(owner, "select * from baptista.events e join baptista.calendar_events c on c.id = e.source_id where c.title = 'Annullato'"), 0);

    await rejects(
      as(db, owner, (q) =>
        q("insert into baptista.events (household_id, event_type, source_type, source_id, visibility, idempotency_key) values ($1, 'x', 'x', $1, 'household', 'x')", [h1]),
      ),
      /permission denied/,
    );
    await rejects(
      as(db, owner, (q) => q("select baptista.emit_event($1, 'x', 'x', $1, 'household', null, '{}', 'k')", [h1])),
      /permission denied/,
    );
  });
});

describe("phase 03 — detectors and observations", () => {
  let h3: string;
  let alice: User;
  let ben: User;
  const NOW = "2026-09-16T08:00:00Z"; // Wed 16 Sep 2026, 10:00 Europe/Rome

  async function refresh(now = NOW) {
    await as(db, "admin", (q) => q("select baptista._refresh_observations($1, $2)", [h3, now]));
  }
  async function active(user: User) {
    return as(db, user, (q) =>
      q<{ type: string; title: string; description: string; priority_score: string; dedupe_key: string; state: string; id: string }>(
        "select id, type, title, description, priority_score, dedupe_key, state from baptista.observations where household_id = $1 and state = 'active' order by priority_score desc, created_at, id",
        [h3],
      ),
    );
  }

  before(async () => {
    alice = await createUser(db, "Alice");
    ben = await createUser(db, "Ben");
    h3 = await createHousehold(alice, "Casa Detector");
    await as(db, alice, (q) => q("select baptista.invite_member($1, $2)", [h3, ben.email]));
    await as(db, ben, (q) => q("select baptista.respond_to_invite($1, true)", [h3]));

    await as(db, alice, async (q) => {
      await q("insert into baptista.tasks (household_id, title, due_date) values ($1, 'Rinnovare assicurazione', '2026-09-14')", [h3]);
      await q("insert into baptista.tasks (household_id, title, due_date) values ($1, 'Scade oggi', '2026-09-16')", [h3]);
      await q("insert into baptista.tasks (household_id, title, due_date, visibility) values ($1, 'Privato di Alice', '2026-09-01', 'private')", [h3]);
      await q("insert into baptista.calendar_events (household_id, title, starts_at, ends_at) values ($1, 'Dentista', '2026-09-16T16:00:00Z', '2026-09-16T17:00:00Z')", [h3]);
      await q("insert into baptista.calendar_events (household_id, title, starts_at, ends_at) values ($1, 'Lontano', '2026-09-22T16:00:00Z', '2026-09-22T17:00:00Z')", [h3]);
      await q("insert into baptista.calendar_events (household_id, title, all_day, start_date, end_date) values ($1, 'Gita', true, '2026-09-17', '2026-09-18')", [h3]);
      const [habit] = await q<{ id: string }>(
        "insert into baptista.habits (household_id, title, target_per_week, starts_on) values ($1, 'Yoga', 3, '2026-08-31') returning id",
        [h3],
      );
      // Previous week (7–13 Sep): 1 of 3. Current week: 1 so far.
      await q("insert into baptista.habit_entries (household_id, habit_id, performed_on) values ($1, $2, '2026-09-09'), ($1, $2, '2026-09-15')", [h3, habit.id]);
      await q("insert into baptista.goals (household_id, title, target_value, current_value, unit) values ($1, 'Km di corsa', 100, 0, 'km')", [h3]);
    });
  });

  test("detectors produce the expected situations with Italian, honest wording", async () => {
    await refresh();
    const obs = await active(alice);
    const types = obs.map((o) => o.type).sort();
    assert.deepEqual(types, ["habit_progress", "missed_habit", "overdue_task", "overdue_task", "upcoming_calendar", "upcoming_calendar"]);
    const overdue = obs.find((o) => o.title === "In ritardo: Rinnovare assicurazione");
    assert.ok(overdue);
    assert.equal(overdue.description, "Scadeva lun 14/09 (2 giorni fa)");
    const missed = obs.find((o) => o.type === "missed_habit");
    assert.equal(missed?.title, "Yoga: 1 su 3 registrate la settimana scorsa");
    assert.match(missed?.description ?? "", /Conta solo le registrazioni/);
    const dentist = obs.find((o) => o.title === "Dentista");
    assert.equal(dentist?.description, "Inizia mer 16/09 alle 18:00");
    assert.ok(!obs.some((o) => o.title === "Lontano"), "events beyond 24h are not upcoming");
    assert.ok(!obs.some((o) => o.title.includes("Scade oggi")), "due today is not overdue");
  });

  test("private sources produce private observations", async () => {
    const forBen = await active(ben);
    assert.ok(!forBen.some((o) => o.title.includes("Privato di Alice")));
    const forAlice = await active(alice);
    assert.ok(forAlice.some((o) => o.title.includes("Privato di Alice")));
  });

  test("repeated refresh does not duplicate observations", async () => {
    const before = (await active(alice)).length;
    await refresh("2026-09-16T08:05:00Z");
    await refresh("2026-09-16T08:10:00Z");
    assert.equal((await active(alice)).length, before);
    const [row] = await as(db, "admin", (q) =>
      q<{ n: number }>("select count(*)::int n from baptista.observations where household_id = $1", [h3]),
    );
    assert.equal(row.n, before);
  });

  test("ranking is stable and versioned", async () => {
    const obs = await active(alice);
    const scores = obs.map((o) => Number(o.priority_score));
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    const [p] = await as(db, alice, (q) =>
      q<{ s: string }>("select baptista.priority_score(1, 1, 1, 1, 10, 0) as s"),
    );
    assert.equal(Number(p.s), 100);
  });

  test("dismissal sticks for the same situation; completion resolves", async () => {
    const overdue = (await active(alice)).find((o) => o.title === "In ritardo: Rinnovare assicurazione")!;
    await rejects(as(db, stranger, (q) => q("select baptista.dismiss_observation($1)", [overdue.id])), /not_found/);
    await as(db, ben, (q) => q("select baptista.dismiss_observation($1)", [overdue.id]));
    await refresh("2026-09-16T09:00:00Z");
    assert.ok(!(await active(alice)).some((o) => o.id === overdue.id), "dismissed stays dismissed");

    await as(db, alice, (q) => q("update baptista.tasks set status = 'completed' where title = 'Scade oggi'"));
    await as(db, alice, (q) => q("update baptista.tasks set status = 'completed' where title = 'Privato di Alice'"));
    await refresh("2026-09-16T09:30:00Z");
    assert.ok(!(await active(alice)).some((o) => o.title.includes("Privato di Alice")), "completed task resolves");
  });

  test("goal progress reacts to a recorded change only", async () => {
    await refresh("2026-09-16T10:00:00Z");
    assert.ok(!(await active(alice)).some((o) => o.type === "goal_progress"));
    await as(db, ben, (q) => q("update baptista.goals set current_value = 12.5 where household_id = $1", [h3]));
    const [ev] = await as(db, "admin", (q) =>
      q<{ occurred_at: string }>("select occurred_at from baptista.events where household_id = $1 and event_type = 'goal.progress_changed'", [h3]),
    );
    await refresh(new Date(new Date(ev.occurred_at).getTime() + 60_000).toISOString());
    const goal = (await active(alice)).find((o) => o.type === "goal_progress");
    assert.equal(goal?.title, "Km di corsa: 12%");
    assert.equal(goal?.description, "da 0 a 100 km, ora 12,5");
  });

  test("decreasing goals: progress runs from start to target, never shown complete early", async () => {
    const [g] = await as(db, alice, (q) =>
      q<{ id: string }>(
        "insert into baptista.goals (household_id, title, start_value, target_value, current_value, unit) values ($1, 'Perdere peso', 85, 70, 85, 'kg') returning id",
        [h3],
      ),
    );
    const pct = async () => {
      const [row] = await as(db, alice, (q) =>
        q<{ p: number }>("select baptista.goal_percent(start_value, current_value, target_value) as p from baptista.goals where id = $1", [g.id]),
      );
      return row.p;
    };
    assert.equal(await pct(), 0);
    await as(db, alice, (q) => q("update baptista.goals set current_value = 80 where id = $1", [g.id]));
    assert.equal(await pct(), 33);
    await as(db, alice, (q) => q("update baptista.goals set current_value = 90 where id = $1", [g.id]));
    assert.equal(await pct(), 0, "moving away from the target never goes negative");
    await as(db, alice, (q) => q("update baptista.goals set current_value = 68 where id = $1", [g.id]));
    assert.equal(await pct(), 100, "past the target is capped at 100");
    const [ev] = await as(db, alice, (q) =>
      q<{ payload: { start: string } }>(
        "select payload from baptista.events where source_id = $1 and event_type = 'goal.progress_changed' order by occurred_at desc limit 1",
        [g.id],
      ),
    );
    assert.equal(Number(ev.payload.start), 85);
  });

  test("goal constraints: target must differ from start, values non-negative", async () => {
    await rejects(
      as(db, alice, (q) => q("insert into baptista.goals (household_id, title, start_value, target_value) values ($1, 'x', 10, 10)", [h3])),
      /check constraint/,
    );
    await rejects(
      as(db, alice, (q) => q("insert into baptista.goals (household_id, title, start_value, target_value) values ($1, 'x', -5, 10)", [h3])),
      /check constraint/,
    );
    await rejects(
      as(db, alice, (q) => q("insert into baptista.goals (household_id, title, target_value, current_value) values ($1, 'x', 10, -1)", [h3])),
      /check constraint/,
    );
  });

  test("week boundaries use the household timezone (DST change, month boundary)", async () => {
    // Sunday 25 Oct 2026 23:30 UTC = Monday 26 Oct 00:30 Europe/Rome (after DST ends).
    await refresh("2026-10-25T23:30:00Z");
    const keys = (await active(alice)).map((o) => o.dedupe_key);
    assert.ok(keys.some((k) => k.startsWith("missed_habit:") && k.endsWith(":2026-10-19")));
    assert.ok(keys.some((k) => k.startsWith("habit_progress:") && k.endsWith(":2026-10-26")));
    // Week of 26 Oct – 1 Nov spans the month boundary; refresh on Sun 1 Nov stays in the same week.
    await refresh("2026-11-01T12:00:00Z");
    const later = (await active(alice)).map((o) => o.dedupe_key);
    assert.ok(later.some((k) => k.startsWith("habit_progress:") && k.endsWith(":2026-10-26")));
  });

  test("on-demand refresh is member-only and throttled", async () => {
    await rejects(as(db, stranger, (q) => q("select baptista.refresh_observations($1)", [h3])), /forbidden/);
    // Earlier tests simulated clocks in the future; start from a clean bookkeeping row.
    await as(db, "admin", (q) => q("delete from baptista.observation_refreshes where household_id = $1", [h3]));
    const [first] = await as(db, alice, (q) => q<{ r: boolean }>("select baptista.refresh_observations($1) as r", [h3]));
    const [second] = await as(db, ben, (q) => q<{ r: boolean }>("select baptista.refresh_observations($1) as r", [h3]));
    assert.equal(first.r, true);
    assert.equal(second.r, false);
  });

  test("revoked members lose access to records and derived data", async () => {
    await as(db, alice, (q) => q("select baptista.remove_member($1, $2)", [h3, ben.id]));
    assert.equal(await count(ben, "select * from baptista.tasks where household_id = $1", [h3]), 0);
    assert.equal(await count(ben, "select * from baptista.observations where household_id = $1", [h3]), 0);
    assert.equal(await count(ben, "select * from baptista.events where household_id = $1", [h3]), 0);
  });

  test("switching a record to private removes its shared derived data", async () => {
    const [ev] = await as(db, alice, (q) =>
      q<{ id: string }>("select id from baptista.calendar_events where title = 'Dentista'"),
    );
    await as(db, alice, (q) => q("update baptista.calendar_events set visibility = 'private' where id = $1", [ev.id]));
    const [row] = await as(db, "admin", (q) =>
      q<{ n: number }>("select count(*)::int n from baptista.observations where source_id = $1", [ev.id]),
    );
    assert.equal(row.n, 0);
    const [vis] = await as(db, "admin", (q) =>
      q<{ v: string }>("select distinct visibility v from baptista.events where source_id = $1", [ev.id]),
    );
    assert.equal(vis.v, "private");
  });
});

describe("categories — system, personal, colours", () => {
  let hc: string;
  let ugo: User;
  let vera: User;
  let ugoCategory: string;
  const list = (user: User) =>
    as(db, user, (q) => q<{ id: string; name: string; owner_user_id: string | null }>("select id, name, owner_user_id from baptista.categories order by name"));

  before(async () => {
    ugo = await createUser(db, "Ugo");
    vera = await createUser(db, "Vera");
    hc = await createHousehold(ugo, "Casa Categorie");
    await as(db, ugo, (q) => q("select baptista.invite_member($1, $2)", [hc, vera.email]));
    await as(db, vera, (q) => q("select baptista.respond_to_invite($1, true)", [hc]));
    const [row] = await as(db, ugo, (q) =>
      q<{ id: string; owner_user_id: string; color: string }>(
        "insert into baptista.categories (name, color) values ('  Meditazione ', '#AABBCC') returning id, owner_user_id, color",
      ),
    );
    ugoCategory = row.id;
    assert.equal(row.owner_user_id, ugo.id, "owner comes from the session");
    assert.equal(row.color, "#aabbcc", "colour normalised to lowercase");
  });

  test("system categories are visible to everyone; personal ones only to their owner", async () => {
    const forVera = await list(vera);
    assert.ok(forVera.some((c) => c.name === "Salute" && c.owner_user_id === null));
    assert.ok(!forVera.some((c) => c.id === ugoCategory), "another user's category is not listed");
    assert.ok((await list(ugo)).some((c) => c.id === ugoCategory && c.name === "Meditazione"));
    await rejects(as(db, "anon", (q) => q("select * from baptista.categories")), /permission denied/);
  });

  test("clients cannot create system categories or edit someone else's", async () => {
    await rejects(
      as(db, vera, (q) => q("insert into baptista.categories (owner_user_id, name, color) values (null, 'Finta', '#000000')")),
      /permission denied/,
    );
    await as(db, vera, (q) => q("update baptista.categories set color = '#000000' where name = 'Salute'"));
    const [salute] = await as(db, "admin", (q) => q<{ color: string }>("select color from baptista.categories where name = 'Salute' and owner_user_id is null"));
    assert.notEqual(salute.color, "#000000", "system category untouched (RLS filters the update)");
    await as(db, vera, (q) => q("delete from baptista.categories where id = $1", [ugoCategory]));
    assert.ok((await list(ugo)).some((c) => c.id === ugoCategory), "cannot delete someone else's category");
  });

  test("invalid colours and duplicate names are rejected; same name for different users is fine", async () => {
    await rejects(as(db, ugo, (q) => q("insert into baptista.categories (name, color) values ('x', 'red')")), /check constraint/);
    await rejects(as(db, ugo, (q) => q("insert into baptista.categories (name, color) values ('meditazione', '#123456')")), /duplicate key/);
    await as(db, vera, (q) => q("insert into baptista.categories (name, color) values ('Meditazione', '#123456')"));
  });

  test("only system or own categories can be assigned", async () => {
    await rejects(
      as(db, vera, (q) =>
        q("insert into baptista.habits (household_id, title, target_per_week, category_id) values ($1, 'Respirare', 3, $2)", [hc, ugoCategory]),
      ),
      /category_unavailable/,
    );
    const [salute] = await as(db, vera, (q) => q<{ id: string }>("select id from baptista.categories where name = 'Salute' and owner_user_id is null"));
    await as(db, vera, (q) =>
      q("insert into baptista.goals (household_id, title, target_value, category_id) values ($1, 'Passi', 100, $2)", [hc, salute.id]),
    );
  });

  test("a shared habit shows its personal category to every member, without listing it", async () => {
    await as(db, ugo, (q) =>
      q("insert into baptista.habits (household_id, title, target_per_week, category_id) values ($1, 'Meditare', 5, $2)", [hc, ugoCategory]),
    );
    const [joined] = await as(db, vera, (q) =>
      q<{ name: string; color: string }>(
        "select c.name, c.color from baptista.habits h join baptista.categories c on c.id = h.category_id where h.title = 'Meditare'",
      ),
    );
    assert.deepEqual(joined, { name: "Meditazione", color: "#aabbcc" });
    const mine = await as(db, vera, (q) =>
      q<{ id: string }>("select id from baptista.categories where owner_user_id is null or owner_user_id = $1", [vera.id]),
    );
    assert.ok(!mine.some((c) => c.id === ugoCategory), "the picker query never lists it");
    // A private habit does not leak its category to other members.
    const [priv] = await as(db, ugo, (q) =>
      q<{ id: string }>("insert into baptista.categories (name, color) values ('Segreta', '#101010') returning id"),
    );
    await as(db, ugo, (q) =>
      q("insert into baptista.habits (household_id, title, target_per_week, category_id, visibility) values ($1, 'Privata', 1, $2, 'private')", [hc, priv.id]),
    );
    assert.equal(await count(vera, "select * from baptista.categories where id = $1", [priv.id]), 0);
  });

  test("deleting a personal category leaves records without category", async () => {
    await as(db, ugo, (q) => q("delete from baptista.categories where id = $1", [ugoCategory]));
    const [h] = await as(db, vera, (q) => q<{ category_id: string | null }>("select category_id from baptista.habits where title = 'Meditare'"));
    assert.equal(h.category_id, null);
  });
});
