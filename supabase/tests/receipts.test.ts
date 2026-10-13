import { strict as assert } from "node:assert";
import { before, describe, test } from "node:test";
import { as, createDb, createUser, rejects, type Db } from "./harness";

/** Phase 04 — receipt photo attached to an expense: private bucket, paths and purge. */

type User = { id: string; email: string };

let db: Db;
let anna: User; // owner of H1
let bruno: User; // member of H1
let carla: User; // owner of H2, stranger to H1
let h1: string;
let h2: string;

const bucket = "baptista-receipts";
const path = (h: string, u: User, upload = "11111111-1111-4111-8111-111111111111") => `${h}/${u.id}/${upload}/scontrino.jpg`;

async function createHousehold(user: User, name: string) {
  const [row] = await as(db, user, (q) => q<{ id: string }>("select baptista.create_household($1, 'Europe/Rome') as id", [name]));
  return row.id;
}

async function join(owner: User, household: string, user: User) {
  await as(db, owner, (q) => q("select baptista.invite_member($1, $2)", [household, user.email]));
  await as(db, user, (q) => q("select baptista.respond_to_invite($1, true)", [household]));
}

async function upload(user: User, name: string) {
  await as(db, user, (q) => q("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]));
}

async function canRead(user: User, name: string) {
  const rows = await as(db, user, (q) => q("select id from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
  return rows.length === 1;
}

async function del(user: User, name: string) {
  return (await as(db, user, (q) => q("delete from storage.objects where bucket_id = $1 and name = $2 returning id", [bucket, name]))).length;
}

async function expense(user: User, household: string, receipt: string | null, visibility = "household") {
  const [row] = await as(db, user, (q) =>
    q<{ id: string }>(
      "insert into baptista.expenses (household_id, merchant, occurred_on, currency, total, receipt_path, visibility) values ($1, 'Coop', '2026-10-12', 'EUR', 42.5, $2, $3) returning id",
      [household, receipt, visibility],
    ),
  );
  return row.id;
}

before(async () => {
  db = await createDb();
  anna = await createUser(db, "Anna");
  bruno = await createUser(db, "Bruno");
  carla = await createUser(db, "Carla");
  h1 = await createHousehold(anna, "Casa Rossi");
  h2 = await createHousehold(carla, "Casa Bianchi");
  await join(anna, h1, bruno);
});

describe("receipt photos", () => {
  test("the bucket is private and accepts only JPEG up to 10 MB", async () => {
    const [b] = await as(db, "admin", (q) =>
      q<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>("select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]),
    );
    assert.equal(b.public, false);
    assert.equal(Number(b.file_size_limit), 10485760);
    assert.deepEqual(b.allowed_mime_types, ["image/jpeg"]);
  });

  test("uploads only into your own folder of a household you belong to", async () => {
    await upload(anna, path(h1, anna));
    await rejects(upload(bruno, path(h1, anna, "22222222-2222-4222-8222-222222222222")), /row-level security/);
    await rejects(upload(carla, path(h1, carla)), /row-level security/);
    await rejects(upload(anna, `${h1}/${anna.id}/scontrino.jpg`), /row-level security/);
  });

  test("readable by the uploader, then by whoever can read the expense", async () => {
    const receipt = path(h1, anna);
    assert.equal(await canRead(bruno, receipt), false, "not yet attached");
    const id = await expense(anna, h1, receipt);
    assert.equal(await canRead(bruno, receipt), true);
    assert.equal(await canRead(carla, receipt), false);
    await as(db, anna, (q) => q("update baptista.expenses set visibility = 'private' where id = $1", [id]));
    assert.equal(await canRead(bruno, receipt), false, "private expense hides its receipt");
    assert.equal(await canRead(anna, receipt), true);
  });

  test("an expense cannot point at someone else's file or another household", async () => {
    const theirs = path(h1, bruno, "33333333-3333-4333-8333-333333333333");
    await upload(bruno, theirs);
    await rejects(expense(anna, h1, theirs), /forbidden/);
    await rejects(expense(anna, h1, path(h2, anna)), /check constraint/);
    await rejects(expense(anna, h1, `${h1}/${anna.id}/x.jpg`), /check constraint/);

    // A member may attach their own receipt to a shared expense created by someone else.
    const shared = await expense(anna, h1, null);
    await as(db, bruno, (q) => q("update baptista.expenses set receipt_path = $2 where id = $1", [shared, theirs]));
    assert.equal(await canRead(anna, theirs), true);
    assert.equal(await del(carla, theirs), 0);
    assert.equal(await del(anna, theirs), 1, "whoever can read the expense can remove its receipt");
  });

  test("a departed member's private receipts are returned by the purge and become deletable", async () => {
    const leaver = await createUser(db, "Leo");
    await join(anna, h1, leaver);
    const receipt = path(h1, leaver, "44444444-4444-4444-8444-444444444444");
    await upload(leaver, receipt);
    await expense(leaver, h1, receipt, "private");
    await as(db, anna, (q) => q("select baptista.remove_member($1, $2)", [h1, leaver.id]));
    await as(db, "admin", (q) =>
      q("update baptista.household_members set revoked_at = now() - interval '31 days' where household_id = $1 and user_id = $2", [h1, leaver.id]),
    );
    await as(db, "admin", (q) => q("delete from baptista.household_maintenance where household_id = $1", [h1]));
    assert.equal(await canRead(anna, receipt), false, "still used by a private expense");

    const rows = await as(db, anna, (q) => q<{ bucket: string; path: string }>("select bucket, path from baptista.purge_departed_data($1)", [h1]));
    assert.deepEqual(rows, [{ bucket, path: receipt }]);
    assert.equal(await del(anna, receipt), 1);
  });
});
