import { strict as assert } from "node:assert";
import { before, describe, test } from "node:test";
import { as, createDb, createUser, rejects, type Db } from "./harness";

/** Phase 05 — processed_path grants/trigger/constraints, looks and look_items. */

type User = { id: string; email: string };

let db: Db;
let anna: User;
let bruno: User;
let carla: User;
let h1: string;
let h2: string;

async function createHousehold(user: User, name: string) {
  const [row] = await as(db, user, (q) => q<{ id: string }>("select baptista.create_household($1, 'Europe/Rome') as id", [name]));
  return row.id;
}

async function count(user: User, sql: string, params: unknown[] = []) {
  const [row] = await as(db, user, (q) => q<{ n: number }>(`select count(*)::int as n from (${sql}) s`, params));
  return row.n;
}

async function insertOne(user: User, sql: string, params: unknown[]) {
  const [row] = await as(db, user, (q) => q<{ id: string }>(`${sql} returning id`, params));
  return row.id;
}

const bucket = "baptista-wardrobe";
const path = (h: string, u: User, file: string, upload = "55555555-5555-4555-8555-555555555555") => `${h}/${u.id}/${upload}/${file}`;
async function upload(user: User, name: string) {
  await as(db, user, (q) => q("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]));
}

before(async () => {
  db = await createDb();
  anna = await createUser(db, "Anna");
  bruno = await createUser(db, "Bruno");
  carla = await createUser(db, "Carla");
  h1 = await createHousehold(anna, "Casa Phase05");
  h2 = await createHousehold(carla, "Casa Altro");
  await as(db, anna, (q) => q("select baptista.invite_member($1, $2)", [h1, bruno.email]));
  await as(db, bruno, (q) => q("select baptista.respond_to_invite($1, true)", [h1]));
});

describe("processed_path — grants, trigger, constraint", () => {
  test("INSERT and UPDATE of processed_path work for authenticated users", async () => {
    const original = path(h1, anna, "original.jpg");
    const thumb = path(h1, anna, "thumb.webp");
    const processed = path(h1, anna, "processed.png");
    await upload(anna, original);
    await upload(anna, thumb);
    await upload(anna, processed);

    const item = await insertOne(
      anna,
      "insert into baptista.wardrobe_items (household_id, name, type, original_path, thumb_path, processed_path) values ($1, 'Test proc', 'top', $2, $3, $4)",
      [h1, original, thumb, processed],
    );
    assert.ok(item);

    // UPDATE processed_path
    await as(db, anna, (q) => q("update baptista.wardrobe_items set processed_path = null where id = $1", [item]));
    const [row] = await as(db, anna, (q) =>
      q<{ processed_path: string | null }>("select processed_path from baptista.wardrobe_items where id = $1", [item]),
    );
    assert.equal(row.processed_path, null);
  });

  test("processed_path trigger validates user folder ownership", async () => {
    const brunoProcessed = path(h1, bruno, "processed.png", "66666666-6666-4666-8666-666666666666");
    await upload(bruno, brunoProcessed);
    await rejects(
      as(db, anna, (q) =>
        q("insert into baptista.wardrobe_items (household_id, name, type, processed_path) values ($1, 'x', 'top', $2)", [h1, brunoProcessed]),
      ),
      /forbidden/,
    );
  });

  test("processed_path CHECK constraint enforces household prefix", async () => {
    const wrongHousehold = path(h2, anna, "processed.png", "77777777-7777-4777-8777-777777777777");
    await rejects(
      as(db, anna, (q) =>
        q("insert into baptista.wardrobe_items (household_id, name, type, processed_path) values ($1, 'x', 'top', $2)", [h1, wrongHousehold]),
      ),
      /check constraint/,
    );
  });
});

describe("looks — RLS, visibility, cascades", () => {
  let look1: string;
  let item1: string;

  before(async () => {
    item1 = await insertOne(
      anna,
      "insert into baptista.wardrobe_items (household_id, name, type) values ($1, 'Capo per look', 'top')",
      [h1],
    );
  });

  test("owner can create a look; household member can read it", async () => {
    look1 = await insertOne(anna, "insert into baptista.looks (household_id, title) values ($1, 'Outfit estivo')", [h1]);
    assert.ok(look1);
    assert.equal(await count(anna, "select * from baptista.looks where id = $1", [look1]), 1);
    assert.equal(await count(bruno, "select * from baptista.looks where id = $1", [look1]), 1);
    assert.equal(await count(carla, "select * from baptista.looks where id = $1", [look1]), 0, "stranger blocked");
  });

  test("private look hidden from household members", async () => {
    const privateLook = await insertOne(
      anna,
      "insert into baptista.looks (household_id, title, visibility) values ($1, 'Look privato', 'private')",
      [h1],
    );
    assert.equal(await count(anna, "select * from baptista.looks where id = $1", [privateLook]), 1);
    assert.equal(await count(bruno, "select * from baptista.looks where id = $1", [privateLook]), 0);
  });

  test("look_items inherit RLS from parent look", async () => {
    await as(db, anna, (q) =>
      q("insert into baptista.look_items (look_id, wardrobe_item_id, x, y, scale, rotation, z_order) values ($1, $2, 0.5, 0.3, 1.0, 0, 0)", [look1, item1]),
    );
    assert.equal(await count(anna, "select * from baptista.look_items where look_id = $1", [look1]), 1);
    assert.equal(await count(bruno, "select * from baptista.look_items where look_id = $1", [look1]), 1);
    assert.equal(await count(carla, "select * from baptista.look_items where look_id = $1", [look1]), 0);
  });

  test("deleting a wardrobe item cascades to look_items", async () => {
    const tempItem = await insertOne(
      anna,
      "insert into baptista.wardrobe_items (household_id, name, type) values ($1, 'Temporaneo', 'bottom')",
      [h1],
    );
    const tempLook = await insertOne(anna, "insert into baptista.looks (household_id, title) values ($1, 'Look temp')", [h1]);
    await as(db, anna, (q) =>
      q("insert into baptista.look_items (look_id, wardrobe_item_id) values ($1, $2)", [tempLook, tempItem]),
    );
    assert.equal(await count(anna, "select * from baptista.look_items where wardrobe_item_id = $1", [tempItem]), 1);
    await as(db, anna, (q) => q("delete from baptista.wardrobe_items where id = $1", [tempItem]));
    assert.equal(await count(anna, "select * from baptista.look_items where wardrobe_item_id = $1", [tempItem]), 0);
  });

  test("deleting a look cascades to look_items", async () => {
    const tempLook = await insertOne(anna, "insert into baptista.looks (household_id, title) values ($1, 'Da cancellare')", [h1]);
    await as(db, anna, (q) =>
      q("insert into baptista.look_items (look_id, wardrobe_item_id) values ($1, $2)", [tempLook, item1]),
    );
    assert.equal(await count(anna, "select * from baptista.look_items where look_id = $1", [tempLook]), 1);
    await as(db, anna, (q) => q("delete from baptista.looks where id = $1", [tempLook]));
    assert.equal(await count(anna, "select * from baptista.look_items where look_id = $1", [tempLook]), 0);
  });

  test("look_items placement constraints enforced", async () => {
    const testLook = await insertOne(anna, "insert into baptista.looks (household_id, title) values ($1, 'Constraint test')", [h1]);
    // x out of range
    await rejects(
      as(db, anna, (q) =>
        q("insert into baptista.look_items (look_id, wardrobe_item_id, x) values ($1, $2, 1.5)", [testLook, item1]),
      ),
      /check constraint/,
    );
    // scale out of range
    await rejects(
      as(db, anna, (q) =>
        q("insert into baptista.look_items (look_id, wardrobe_item_id, scale) values ($1, $2, 5.0)", [testLook, item1]),
      ),
      /check constraint/,
    );
    // rotation out of range
    await rejects(
      as(db, anna, (q) =>
        q("insert into baptista.look_items (look_id, wardrobe_item_id, rotation) values ($1, $2, 400)", [testLook, item1]),
      ),
      /check constraint/,
    );
  });
});
