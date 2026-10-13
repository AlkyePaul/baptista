import { strict as assert } from "node:assert";
import { before, describe, test } from "node:test";
import { as, createDb, createUser, rejects, type Db } from "./harness";

/** D33 — `app_users` is the single source of who uses Baptista and in which household. */

type User = { id: string; email: string };

let db: Db;
let owner: User;
let household: string;

async function one<R>(user: User | "admin", sql: string, params: unknown[] = []) {
  const [row] = await as(db, user, (q) => q<R>(sql, params));
  return row;
}

const membership = (user: User) =>
  one<{ role: string; state: string } | undefined>("admin", "select role, state from baptista.household_members where user_id = $1 and household_id = $2", [user.id, household]);

before(async () => {
  db = await createDb();
  owner = await createUser(db, "Paola");
  household = (await one<{ id: string }>(owner, "select baptista.create_household('Casa', 'Europe/Rome') as id")).id;
});

describe("app users", () => {
  test("a row for an existing account provisions profile and active membership with its role", async () => {
    const laia = await createUser(db, "Laia", false, false);
    await as(db, "admin", (q) => q("insert into baptista.app_users (email, display_name, household_id, role) values ($1, 'Laia', $2, 'owner')", [laia.email, household]));
    assert.deepEqual(await membership(laia), { role: "owner", state: "active" });
    const profile = await one<{ display_name: string }>("admin", "select display_name from baptista.profiles where user_id = $1", [laia.id]);
    assert.equal(profile.display_name, "Laia");
    // Two owners: both can change the household.
    await as(db, laia, (q) => q("select baptista.update_household($1, 'Casa nuova', 'Europe/Rome', 1)", [household]));

    await as(db, "admin", (q) => q("update baptista.app_users set role = 'member' where email = $1", [laia.email]));
    assert.deepEqual(await membership(laia), { role: "member", state: "active" });
  });

  test("an account created after its row is provisioned at sign-in by claim_app_user", async () => {
    await as(db, "admin", (q) => q("insert into baptista.app_users (email, display_name, household_id) values ('marco@test.local', 'Marco', $1)", [household]));
    const marco = await createUser(db, "Marco", false, false);
    assert.equal(await membership(marco), undefined, "nothing until sign-in");
    const claimed = await one<{ id: string }>(marco, "select baptista.claim_app_user() as id");
    assert.equal(claimed.id, household);
    assert.deepEqual(await membership(marco), { role: "member", state: "active" });
    assert.equal((await as(db, marco, (q) => q("select id from baptista.households"))).length, 1);
  });

  test("accounts not in app_users get nothing and cannot call procedures", async () => {
    const guest = await createUser(db, "Ospite", true, false);
    assert.equal((await one<{ id: string | null }>(guest, "select baptista.claim_app_user() as id")).id, null);
    await rejects(as(db, guest, (q) => q("select baptista.create_household('Mia', 'Europe/Rome')")), /not_allowed/);
    await rejects(as(db, guest, (q) => q("select * from baptista.app_users")), /permission denied/);
    await rejects(as(db, owner, (q) => q("select * from baptista.app_users")), /permission denied/);
    await rejects(as(db, "anon", (q) => q("select baptista.claim_app_user()")), /permission denied/);
  });

  test("deleting the row revokes the membership and the access", async () => {
    const dario = await createUser(db, "Dario", false, false);
    await as(db, "admin", (q) => q("insert into baptista.app_users (email, display_name, household_id) values ($1, 'Dario', $2)", [dario.email, household]));
    assert.equal((await as(db, dario, (q) => q("select id from baptista.households"))).length, 1);
    await as(db, "admin", (q) => q("delete from baptista.app_users where email = $1", [dario.email]));
    assert.equal((await membership(dario))?.state, "revoked");
    assert.equal((await as(db, dario, (q) => q("select id from baptista.households"))).length, 0);
    await rejects(as(db, dario, (q) => q("select baptista.refresh_observations($1)", [household])), /not_allowed/);
  });

  test("moving a row to another household revokes the old membership", async () => {
    const elena = await createUser(db, "Elena", false, false);
    const other = (await one<{ id: string }>(owner, "select baptista.create_household('Seconda', 'Europe/Rome') as id")).id;
    await as(db, "admin", (q) => q("insert into baptista.app_users (email, display_name, household_id) values ($1, 'Elena', $2)", [elena.email, household]));
    await as(db, "admin", (q) => q("update baptista.app_users set household_id = $2 where email = $1", [elena.email, other]));
    assert.equal((await membership(elena))?.state, "revoked");
    const rows = await as(db, elena, (q) => q<{ id: string }>("select id from baptista.households"));
    assert.deepEqual(rows.map((r) => r.id), [other]);
  });

  test("emails are stored normalized", async () => {
    await rejects(as(db, "admin", (q) => q("insert into baptista.app_users (email, display_name) values ('Mixed@Test.local', 'X')")), /check constraint/);
  });
});
