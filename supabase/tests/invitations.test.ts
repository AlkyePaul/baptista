import { strict as assert } from "node:assert";
import { before, describe, test } from "node:test";
import { as, createDb, createUser, rejects, type Db } from "./harness";

type User = { id: string; email: string };

let db: Db;

async function createHousehold(user: User, name: string) {
  const [row] = await as(db, user, (q) => q<{ id: string }>("select baptista.create_household($1, 'Europe/Rome') as id", [name]));
  return row.id;
}

async function count(user: User | "admin", sql: string, params: unknown[] = []) {
  const [row] = await as(db, user, (q) => q<{ n: number }>(`select count(*)::int as n from (${sql}) s`, params));
  return row.n;
}

async function invite(owner: User, household: string, email: string) {
  const [row] = await as(db, owner, (q) => q<{ code: string | null }>("select baptista.invite_member($1, $2) as code", [household, email]));
  return row.code;
}

async function claim(user: User, code: string) {
  const [row] = await as(db, user, (q) => q<{ id: string | null }>("select baptista.claim_invitation($1, 'Nuovo') as id", [code]));
  return row.id;
}

async function join(owner: User, household: string, user: User) {
  await invite(owner, household, user.email);
  await as(db, user, (q) => q("select baptista.respond_to_invite($1, true)", [household]));
}

/** Simulates time passing for the purge: departure 31 days ago, throttle reset. */
async function backdate(household: string, user: User) {
  await as(db, "admin", (q) =>
    q("update baptista.household_members set revoked_at = now() - interval '31 days' where household_id = $1 and user_id = $2", [household, user.id]),
  );
  await as(db, "admin", (q) => q("delete from baptista.household_maintenance where household_id = $1", [household]));
}

before(async () => {
  db = await createDb();
});

describe("invite-only access", () => {
  test("profiles cannot be self-provisioned", async () => {
    const outsider = await createUser(db, "Fuori", false);
    await rejects(
      as(db, outsider, (q) => q("insert into baptista.profiles (user_id, display_name) values ($1, 'x')", [outsider.id])),
      /permission denied/,
    );
    assert.equal(await claim(outsider, "AAAAAAAA"), null);
    assert.equal(await count("admin", "select * from baptista.profiles where user_id = $1", [outsider.id]), 0);
  });

  test("an email invite yields a code that only that address can redeem, once", async () => {
    const owner = await createUser(db, "Olga");
    const h = await createHousehold(owner, "Casa Olga");
    const code = await invite(owner, h, "  Nina@Test.local ");
    assert.match(code ?? "", /^[A-HJ-NP-Z2-9]{8}$/);

    const thief = await createUser(db, "Ladro", false);
    assert.equal(await claim(thief, code!), null);

    const nina = await createUser(db, "Nina", false);
    const formatted = `${code!.slice(0, 4).toLowerCase()}-${code!.slice(4)}`;
    assert.equal(await claim(nina, formatted), h);
    const [m] = await as(db, nina, (q) =>
      q<{ role: string; state: string }>("select role, state from baptista.household_members where household_id = $1 and user_id = $2", [h, nina.id]),
    );
    assert.deepEqual(m, { role: "member", state: "active" });
    assert.equal(await count(nina, "select * from baptista.profiles where user_id = $1", [nina.id]), 1);
    assert.equal(await claim(nina, code!), null, "codes are single-use");
  });

  test("existing Baptista users get a pending membership and no code", async () => {
    const owner = await createUser(db, "Paola");
    const h = await createHousehold(owner, "Casa Paola");
    const friend = await createUser(db, "Rita");
    assert.equal(await invite(owner, h, friend.email), null);
    assert.equal(await count(friend, "select * from baptista.household_members where household_id = $1 and state = 'pending'", [h]), 1);
  });

  test("wrong codes lock the invitation after 5 attempts; expiry and re-invite", async () => {
    const owner = await createUser(db, "Sara");
    const h = await createHousehold(owner, "Casa Sara");
    const tom = await createUser(db, "Tom", false);
    const code = await invite(owner, h, tom.email);
    for (let i = 0; i < 5; i++) assert.equal(await claim(tom, "ZZZZZZZZ"), null);
    assert.equal(await claim(tom, code!), null, "locked");
    const [row] = await as(db, owner, (q) => q<{ locked: boolean }>("select locked from baptista.list_invitations($1)", [h]));
    assert.equal(row.locked, true);

    const fresh = await invite(owner, h, tom.email);
    assert.notEqual(fresh, code);
    await as(db, "admin", (q) => q("update baptista.household_invitations set expires_at = now() - interval '1 minute' where household_id = $1", [h]));
    assert.equal(await claim(tom, fresh!), null, "expired");
  });

  test("only the owner lists and cancels invitations; open invitations are capped", async () => {
    const owner = await createUser(db, "Ugo");
    const h = await createHousehold(owner, "Casa Ugo");
    const member = await createUser(db, "Vera");
    await join(owner, h, member);
    await invite(owner, h, "qualcuno@test.local");
    assert.equal(await count(member, "select * from baptista.list_invitations($1)", [h]), 0);
    await rejects(as(db, member, (q) => q("select baptista.cancel_invitation($1, 'qualcuno@test.local')", [h])), /forbidden/);
    await as(db, owner, (q) => q("select baptista.cancel_invitation($1, 'QUALCUNO@test.local')", [h]));
    assert.equal(await count(owner, "select * from baptista.list_invitations($1)", [h]), 0);
    await rejects(as(db, member, (q) => q("select * from baptista.household_invitations")), /permission denied/);

    for (let i = 0; i < 20; i++) await invite(owner, h, `ospite${i}@test.local`);
    await rejects(invite(owner, h, "ospite20@test.local"), /too_many_invites/);
  });
});

describe("household lifecycle", () => {
  test("the last member leaving deletes the household and its data", async () => {
    const solo = await createUser(db, "Zeno");
    const h = await createHousehold(solo, "Casa Zeno");
    await invite(solo, h, "attesa@test.local");
    await as(db, solo, (q) => q("insert into baptista.tasks (household_id, title) values ($1, 'x')", [h]));
    await as(db, solo, (q) => q("select baptista.remove_member($1, $2)", [h, solo.id]));
    assert.equal(await count("admin", "select * from baptista.households where id = $1", [h]), 0);
    assert.equal(await count("admin", "select * from baptista.tasks where household_id = $1", [h]), 0);
    assert.equal(await count("admin", "select * from baptista.household_invitations where household_id = $1", [h]), 0);
  });

  test("deleting the owner's account promotes the longest-standing member", async () => {
    const owner = await createUser(db, "Alba");
    const h = await createHousehold(owner, "Casa Alba");
    const first = await createUser(db, "Bice");
    const second = await createUser(db, "Ciro");
    await join(owner, h, first);
    await join(owner, h, second);
    await as(db, "admin", (q) => q("delete from auth.users where id = $1", [owner.id]));
    const rows = await as(db, "admin", (q) =>
      q<{ user_id: string }>("select user_id from baptista.household_members where household_id = $1 and role = 'owner'", [h]),
    );
    assert.deepEqual(rows.map((r) => r.user_id), [first.id]);
  });

  test("deleting the only member's account deletes the household", async () => {
    const solo = await createUser(db, "Dora");
    const h = await createHousehold(solo, "Casa Dora");
    await as(db, "admin", (q) => q("delete from auth.users where id = $1", [solo.id]));
    assert.equal(await count("admin", "select * from baptista.households where id = $1", [h]), 0);
  });
});

describe("departed-member purge", () => {
  let owner: User;
  let leaver: User;
  let h: string;

  before(async () => {
    owner = await createUser(db, "Elio");
    leaver = await createUser(db, "Fede");
    h = await createHousehold(owner, "Casa Elio");
    await join(owner, h, leaver);
    await as(db, leaver, (q) =>
      q("insert into baptista.tasks (household_id, title, visibility) values ($1, 'Segreto', 'private'), ($1, 'Condiviso', 'household')", [h]),
    );
    await as(db, owner, (q) => q("insert into baptista.tasks (household_id, title, visibility) values ($1, 'Mio', 'private')", [h]));
    await as(db, owner, (q) => q("select baptista.remove_member($1, $2)", [h, leaver.id]));
  });

  const titles = async () =>
    (await as(db, "admin", (q) => q<{ title: string }>("select title from baptista.tasks where household_id = $1 order by title", [h]))).map(
      (r) => r.title,
    );

  test("nothing is purged within 30 days; only active members may run it", async () => {
    await as(db, owner, (q) => q("select * from baptista.purge_departed_data($1)", [h]));
    assert.deepEqual(await titles(), ["Condiviso", "Mio", "Segreto"]);
    await rejects(as(db, leaver, (q) => q("select * from baptista.purge_departed_data($1)", [h])), /forbidden/);
  });

  test("after 30 days private records go, shared ones stay; runs at most once a day", async () => {
    await backdate(h, leaver);
    await as(db, owner, (q) => q("select * from baptista.purge_departed_data($1)", [h]));
    assert.deepEqual(await titles(), ["Condiviso", "Mio"]);

    const stamp = async () =>
      (await as(db, "admin", (q) => q<{ t: string }>("select purged_at::text as t from baptista.household_maintenance where household_id = $1", [h])))[0].t;
    const first = await stamp();
    await as(db, owner, (q) => q("select * from baptista.purge_departed_data($1)", [h]));
    assert.equal(await stamp(), first, "throttled");
  });

  test("a member who comes back keeps their private records; one who never does loses them", async () => {
    const back = await createUser(db, "Gino");
    const gone = await createUser(db, "Ivo");
    for (const user of [back, gone]) {
      await join(owner, h, user);
      await as(db, user, (q) => q("insert into baptista.notes (household_id, title, visibility) values ($1, $2, 'private')", [h, user.email]));
      await as(db, user, (q) => q("select baptista.remove_member($1, $2)", [h, user.id]));
      await backdate(h, user);
      await invite(owner, h, user.email); // re-invited: pending keeps the departure date
    }
    await as(db, back, (q) => q("select baptista.respond_to_invite($1, true)", [h]));
    await as(db, owner, (q) => q("select * from baptista.purge_departed_data($1)", [h]));
    const left = await as(db, "admin", (q) => q<{ title: string }>("select title from baptista.notes where household_id = $1", [h]));
    assert.deepEqual(left.map((r) => r.title), [back.email]);
  });

  test("private wardrobe photos are returned and become deletable by members", async () => {
    const owner2 = await createUser(db, "Iris");
    const leaver2 = await createUser(db, "Leo");
    const h2 = await createHousehold(owner2, "Casa Iris");
    await join(owner2, h2, leaver2);
    const photo = `${h2}/${leaver2.id}/11111111-1111-4111-8111-111111111111/a.jpg`;
    await as(db, leaver2, (q) => q("insert into storage.objects (bucket_id, name) values ('baptista-wardrobe', $1)", [photo]));
    await as(db, leaver2, (q) =>
      q("insert into baptista.wardrobe_items (household_id, name, type, original_path, thumb_path, visibility) values ($1, 'Privato', 'top', $2, $2, 'private')", [h2, photo]),
    );
    await as(db, owner2, (q) => q("select baptista.remove_member($1, $2)", [h2, leaver2.id]));
    await backdate(h2, leaver2);
    const visible = () => count(owner2, "select * from storage.objects where bucket_id = 'baptista-wardrobe' and name = $1", [photo]);
    assert.equal(await visible(), 0, "still used by a private item: not readable");

    const paths = await as(db, owner2, (q) => q<{ bucket: string; path: string }>("select bucket, path from baptista.purge_departed_data($1)", [h2]));
    assert.deepEqual([...new Set(paths.map((r) => `${r.bucket}:${r.path}`))], [`baptista-wardrobe:${photo}`]);
    const deleted = await as(db, owner2, (q) =>
      q("delete from storage.objects where bucket_id = 'baptista-wardrobe' and name = $1 returning id", [photo]),
    );
    assert.equal(deleted.length, 1);
  });

  test("every per-user household table is covered by the purge", async () => {
    const rows = await as(db, "admin", (q) =>
      q<{ table_name: string }>(
        `select distinct c.table_name from information_schema.columns c
           join information_schema.columns hh on hh.table_schema = c.table_schema and hh.table_name = c.table_name
                                             and hh.column_name = 'household_id'
          where c.table_schema = 'baptista' and c.column_name in ('owner_user_id', 'user_id')
          order by 1`,
      ),
    );
    const [fn] = await as(db, "admin", (q) =>
      q<{ src: string }>("select prosrc as src from pg_proc where proname = 'purge_departed_data'"),
    );
    // Membership itself and household-only tables (owner kept for attribution) are not purged.
    const exempt = new Set(["household_members", "shopping_items"]);
    const missing = rows.map((r) => r.table_name).filter((t) => !exempt.has(t) && !fn.src.includes(t));
    assert.deepEqual(missing, []);
  });
});
