import { strict as assert } from "node:assert";
import { before, describe, test } from "node:test";
import { as, createDb, createUser, rejects, type Db } from "./harness";

/** Phase 04 — Cucina (D25) and Finanze (D26): constraints, visibility and food detectors. */

type User = { id: string; email: string };

let db: Db;
let anna: User; // owner of H1
let bruno: User; // member of H1
let carla: User; // owner of H2, stranger to H1
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

before(async () => {
  db = await createDb();
  anna = await createUser(db, "Anna");
  bruno = await createUser(db, "Bruno");
  carla = await createUser(db, "Carla");
  h1 = await createHousehold(anna, "Casa Rossi");
  h2 = await createHousehold(carla, "Casa Bianchi");
  await as(db, anna, (q) => q("select baptista.invite_member($1, $2)", [h1, bruno.email]));
  await as(db, bruno, (q) => q("select baptista.respond_to_invite($1, true)", [h1]));
});

describe("cucina — inventory, recipes, meals, diary", () => {
  test("food items: shared vs private, status timestamps set by the database", async () => {
    const shared = await insertOne(anna, "insert into baptista.food_items (household_id, product_name) values ($1, 'Latte')", [h1]);
    await insertOne(anna, "insert into baptista.food_items (household_id, product_name, visibility) values ($1, 'Cioccolato segreto', 'private')", [h1]);
    assert.equal(await count(bruno, "select * from baptista.food_items where household_id = $1", [h1]), 1);
    assert.equal(await count(carla, "select * from baptista.food_items where household_id = $1", [h1]), 0);

    await rejects(as(db, bruno, (q) => q("update baptista.food_items set closed_at = now() where id = $1", [shared])), /permission denied/);
    await as(db, bruno, (q) => q("update baptista.food_items set status = 'consumed' where id = $1", [shared]));
    const [row] = await as(db, anna, (q) => q<{ closed_at: string | null }>("select closed_at from baptista.food_items where id = $1", [shared]));
    assert.ok(row.closed_at, "consumed sets closed_at");
    await as(db, bruno, (q) => q("update baptista.food_items set status = 'available' where id = $1", [shared]));
    const [reopened] = await as(db, anna, (q) => q<{ closed_at: string | null }>("select closed_at from baptista.food_items where id = $1", [shared]));
    assert.equal(reopened.closed_at, null, "explicit correction reopens the item");

    const events = await as(db, anna, (q) =>
      q<{ event_type: string }>("select event_type from baptista.events where source_id = $1 order by occurred_at", [shared]),
    );
    assert.deepEqual(events.map((e) => e.event_type), ["food.item_added", "food.item_consumed"]);
  });

  test("food constraints: negative quantity, bad barcode, estimate without basis, cross-household", async () => {
    const bad = [
      "insert into baptista.food_items (household_id, product_name, quantity) values ($1, 'x', -1)",
      "insert into baptista.food_items (household_id, product_name, barcode) values ($1, 'x', 'abc')",
      "insert into baptista.food_items (household_id, product_name, estimated_expires_on) values ($1, 'x', '2026-09-20')",
      "insert into baptista.food_items (household_id, product_name, kcal_100g) values ($1, 'x', 2000)",
      "insert into baptista.food_items (household_id, product_name, storage) values ($1, 'x', 'garage')",
    ];
    for (const sql of bad) await rejects(as(db, anna, (q) => q(sql, [h1])), /check constraint/);
    await rejects(
      as(db, anna, (q) => q("insert into baptista.food_items (household_id, product_name) values ($1, 'x')", [h2])),
      /row-level security/,
    );
  });

  test("notes are notes or lists only (recipes have their own cookbook, D31)", async () => {
    await rejects(as(db, anna, (q) => q("insert into baptista.notes (household_id, kind, title) values ($1, 'recipe', 'x')", [h1])), /check constraint/);
    await rejects(as(db, anna, (q) => q("insert into baptista.notes (household_id, kind, title) values ($1, 'menu', 'x')", [h1])), /check constraint/);
    // Regression (Phase 03 validator): items with missing keys used to pass the check.
    await rejects(
      as(db, anna, (q) => q(`insert into baptista.notes (household_id, kind, title, items) values ($1, 'list', 'x', '[{"text":"Latte"}]')`, [h1])),
      /check constraint/,
    );
  });

  test("the calorie diary is always private to its owner", async () => {
    await insertOne(anna, "insert into baptista.diet_entries (household_id, eaten_on, slot, label, kcal) values ($1, '2026-09-16', 'lunch', 'Pasta', 650)", [h1]);
    assert.equal(await count(anna, "select * from baptista.diet_entries where household_id = $1", [h1]), 1);
    assert.equal(await count(bruno, "select * from baptista.diet_entries where household_id = $1", [h1]), 0);
    await rejects(
      as(db, anna, (q) => q("insert into baptista.diet_entries (household_id, eaten_on, slot, label, kcal, visibility) values ($1, '2026-09-16', 'lunch', 'x', 1, 'household')", [h1])),
      /permission denied/,
    );
    await rejects(
      as(db, anna, (q) => q("insert into baptista.diet_entries (household_id, eaten_on, slot, label, kcal) values ($1, '2026-09-16', 'brunch', 'x', 1)", [h1])),
      /check constraint/,
    );
    // Deleting a meal keeps the diary snapshot.
    const meal = await insertOne(anna, "insert into baptista.meals (household_id, title) values ($1, 'Da cancellare')", [h1]);
    const entry = await insertOne(anna, "insert into baptista.diet_entries (household_id, eaten_on, slot, label, kcal, meal_id) values ($1, '2026-09-16', 'dinner', 'Da cancellare', 400, $2)", [h1, meal]);
    await as(db, anna, (q) => q("delete from baptista.meals where id = $1", [meal]));
    const [row] = await as(db, anna, (q) => q<{ meal_id: string | null; kcal: string }>("select meal_id, kcal from baptista.diet_entries where id = $1", [entry]));
    assert.deepEqual({ meal: row.meal_id, kcal: Number(row.kcal) }, { meal: null, kcal: 400 });
  });

  test("calorie target is personal profile data", async () => {
    await as(db, anna, (q) => q("update baptista.profiles set kcal_target = 2000 where user_id = $1", [anna.id]));
    await rejects(as(db, anna, (q) => q("update baptista.profiles set kcal_target = 100 where user_id = $1", [anna.id])), /check constraint/);
    const updated = await as(db, bruno, (q) => q("update baptista.profiles set kcal_target = 3000 where user_id = $1 returning user_id", [anna.id]));
    assert.equal(updated.length, 0, "nobody else can change it");
  });
});

describe("cucina — food detectors", () => {
  let hf: string;
  let dora: User;
  let elio: User;
  const NOW = "2026-09-16T08:00:00Z"; // Wed 16 Sep 2026, 10:00 Europe/Rome
  const ids: Record<string, string> = {};

  async function refresh(now = NOW) {
    await as(db, "admin", (q) => q("select baptista._refresh_observations($1, $2)", [hf, now]));
  }
  async function active(user: User) {
    return as(db, user, (q) =>
      q<{ type: string; title: string; description: string; confidence: string; source_id: string; dedupe_key: string }>(
        "select type, title, description, confidence, source_id, dedupe_key from baptista.observations where household_id = $1 and state = 'active' order by priority_score desc, created_at, id",
        [hf],
      ),
    );
  }
  async function food(name: string, fields: Record<string, string>) {
    const cols = Object.keys(fields);
    ids[name] = await insertOne(
      dora,
      `insert into baptista.food_items (household_id, product_name${cols.map((c) => `, ${c}`).join("")})
       values ($1, $2${cols.map((_, i) => `, $${i + 3}`).join("")})`,
      [hf, name, ...Object.values(fields)],
    );
  }

  before(async () => {
    dora = await createUser(db, "Dora");
    elio = await createUser(db, "Elio");
    hf = await createHousehold(dora, "Casa Frigo");
    await as(db, dora, (q) => q("select baptista.invite_member($1, $2)", [hf, elio.email]));
    await as(db, elio, (q) => q("select baptista.respond_to_invite($1, true)", [hf]));

    await food("Pollo", { explicit_expires_on: "2026-09-16" });
    await food("Yogurt", { explicit_expires_on: "2026-09-17" });
    await food("Ricotta", { explicit_expires_on: "2026-09-18" });
    await food("Prosciutto", { explicit_expires_on: "2026-09-14" });
    await food("Burro", { explicit_expires_on: "2026-09-25" });
    await food("Uva", { estimated_expires_on: "2026-09-17", estimate_basis: "Stima dell'utente", category: "produce" });
    await food("Mozzarella", { explicit_expires_on: "2026-09-16", estimated_expires_on: "2026-09-30", estimate_basis: "x" });
    await food("Insalata", { category: "produce", purchased_on: "2026-09-05" });
    await food("Pasta", { category: "pantry", storage: "pantry", purchased_on: "2026-01-01" });
    await food("Piselli", { category: "frozen", storage: "freezer", purchased_on: "2026-01-01" });
    await food("Salsa privata", { explicit_expires_on: "2026-09-16", visibility: "private" });
  });

  test("explicit dates within 2 days or past, estimates with cautious wording", async () => {
    await refresh();
    const obs = await active(dora);
    const byTitle = new Map(obs.map((o) => [o.title, o]));
    assert.ok(byTitle.has("Pollo scade oggi"));
    assert.ok(byTitle.has("Yogurt scade domani"));
    assert.ok(byTitle.has("Ricotta scade ven 18/09"));
    assert.equal(byTitle.get("Scadenza superata: Prosciutto")?.description, "Data sulla confezione: lun 14/09 (2 giorni fa)");
    assert.ok(!obs.some((o) => o.title.includes("Burro")), "beyond 2 days nothing is shown");

    const grape = byTitle.get("Controlla: Uva");
    assert.ok(grape, "estimates never say 'scade'");
    assert.match(grape.description, /Data stimata gio 17\/09, non indicata sulla confezione/);
    assert.equal(Number(grape.confidence), 0.5);

    assert.ok(byTitle.has("Mozzarella scade oggi"), "the explicit date wins over the estimate");
  });

  test("oldFood: only fresh food in the fridge without dates, after 7 days", async () => {
    const obs = await active(dora);
    const old = obs.filter((o) => o.type === "old_food");
    assert.deepEqual(old.map((o) => o.title), ["Insalata: in frigo da 11 giorni"]);
    assert.match(old[0].description, /non un'indicazione sulla sicurezza/);
  });

  test("private food produces private observations", async () => {
    assert.ok((await active(dora)).some((o) => o.title === "Salsa privata scade oggi"));
    assert.ok(!(await active(elio)).some((o) => o.title.includes("Salsa privata")));
  });

  test("consuming resolves; changing the date re-evaluates under a new key", async () => {
    await as(db, elio, (q) => q("update baptista.food_items set status = 'consumed' where id = $1", [ids.Pollo]));
    await as(db, elio, (q) => q("update baptista.food_items set explicit_expires_on = '2026-09-30' where id = $1", [ids.Yogurt]));
    await as(db, elio, (q) => q("update baptista.food_items set explicit_expires_on = '2026-09-16' where id = $1", [ids.Ricotta]));
    await refresh("2026-09-16T08:10:00Z");
    const obs = await active(dora);
    assert.ok(!obs.some((o) => o.source_id === ids.Pollo), "consumed food is resolved");
    assert.ok(!obs.some((o) => o.source_id === ids.Yogurt), "a later date removes the warning");
    const ricotta = obs.filter((o) => o.source_id === ids.Ricotta);
    assert.deepEqual(ricotta.map((o) => o.title), ["Ricotta scade oggi"], "one card per item");
    const [state] = await as(db, "admin", (q) =>
      q<{ state: string }>("select state from baptista.observations where source_id = $1 and dedupe_key like '%2026-09-18'", [ids.Ricotta]),
    );
    assert.equal(state.state, "resolved");
  });

  test("approaching -> today keeps the same observation for the same date", async () => {
    await refresh("2026-09-17T08:00:00Z");
    const obs = await active(dora);
    const keys = obs.filter((o) => o.source_id === ids.Uva).map((o) => o.dedupe_key);
    assert.deepEqual(keys, [`food_expiry:${ids.Uva}:2026-09-17`]);
  });
});

describe("finanze — categories, expenses, budgets, projects", () => {
  let food: string;
  let foreignCategory: string;

  before(async () => {
    await as(db, anna, (q) => q("select baptista.ensure_expense_categories($1)", [h1]));
    await as(db, carla, (q) => q("select baptista.ensure_expense_categories($1)", [h2]));
    [{ id: food }] = await as(db, anna, (q) =>
      q<{ id: string }>("select id from baptista.expense_categories where household_id = $1 and name = 'Spesa alimentare'", [h1]),
    );
    [{ id: foreignCategory }] = await as(db, carla, (q) =>
      q<{ id: string }>("select id from baptista.expense_categories where household_id = $1 limit 1", [h2]),
    );
  });

  test("default categories are created once and only by members", async () => {
    await as(db, bruno, (q) => q("select baptista.ensure_expense_categories($1)", [h1]));
    assert.equal(await count(anna, "select * from baptista.expense_categories where household_id = $1", [h1]), 10);
    assert.equal(await count(carla, "select * from baptista.expense_categories where household_id = $1", [h1]), 0);
    await rejects(as(db, carla, (q) => q("select baptista.ensure_expense_categories($1)", [h1])), /row-level security/);
    await rejects(
      as(db, anna, (q) => q("insert into baptista.expense_categories (household_id, name, color) values ($1, 'spesa ALIMENTARE', '#000000')", [h1])),
      /duplicate key/,
    );
  });

  test("private expenses and their lines stay private", async () => {
    const priv = await insertOne(
      anna,
      "insert into baptista.expenses (household_id, merchant, occurred_on, currency, total, visibility) values ($1, 'Regalo', '2026-09-10', 'EUR', 50, 'private')",
      [h1],
    );
    await as(db, anna, (q) =>
      q("insert into baptista.expense_items (household_id, expense_id, description, line_total) values ($1, $2, 'Sorpresa', 50)", [h1, priv]),
    );
    assert.equal(await count(bruno, "select * from baptista.expenses where id = $1", [priv]), 0);
    assert.equal(await count(bruno, "select * from baptista.expense_items where expense_id = $1", [priv]), 0);
    await rejects(
      as(db, bruno, (q) => q("insert into baptista.expense_items (household_id, expense_id, description, line_total) values ($1, $2, 'x', 1)", [h1, priv])),
      /row-level security/,
    );
  });

  test("expense constraints: currency, totals, description, cross-household references", async () => {
    const base = "insert into baptista.expenses (household_id, merchant, occurred_on, currency, total";
    await rejects(as(db, anna, (q) => q(`${base}) values ($1, 'x', '2026-09-10', 'euro', 1)`, [h1])), /check constraint/);
    await rejects(as(db, anna, (q) => q(`${base}) values ($1, 'x', '2026-09-10', 'EUR', -1)`, [h1])), /check constraint/);
    await rejects(
      as(db, anna, (q) => q("insert into baptista.expenses (household_id, occurred_on, currency, total) values ($1, '2026-09-10', 'EUR', 1)", [h1])),
      /check constraint/,
    );
    await rejects(
      as(db, anna, (q) => q(`${base}, category_id) values ($1, 'x', '2026-09-10', 'EUR', 1, $2)`, [h1, foreignCategory])),
      /foreign key/,
    );
    await insertOne(anna, `${base}, category_id) values ($1, 'Esselunga', '2026-09-10', 'EUR', 42.5, $2)`, [h1, food]);
    // Deleting a category leaves the expense uncategorised.
    const tmp = await insertOne(anna, "insert into baptista.expense_categories (household_id, name, color) values ($1, 'Temporanea', '#123456')", [h1]);
    const exp = await insertOne(anna, `${base}, category_id) values ($1, 'x', '2026-09-10', 'EUR', 1, $2)`, [h1, tmp]);
    await as(db, bruno, (q) => q("delete from baptista.expense_categories where id = $1", [tmp]));
    const [row] = await as(db, anna, (q) => q<{ category_id: string | null }>("select category_id from baptista.expenses where id = $1", [exp]));
    assert.equal(row.category_id, null);
  });

  test("budgets: one per category and currency, one overall", async () => {
    await insertOne(anna, "insert into baptista.budgets (household_id, category_id, monthly_amount) values ($1, $2, 400)", [h1, food]);
    await insertOne(anna, "insert into baptista.budgets (household_id, category_id, monthly_amount, currency) values ($1, $2, 300, 'CHF')", [h1, food]);
    await insertOne(anna, "insert into baptista.budgets (household_id, monthly_amount) values ($1, 2000)", [h1]);
    await rejects(as(db, bruno, (q) => q("insert into baptista.budgets (household_id, category_id, monthly_amount) values ($1, $2, 500)", [h1, food])), /duplicate key/);
    await rejects(as(db, bruno, (q) => q("insert into baptista.budgets (household_id, monthly_amount) values ($1, 1)", [h1])), /duplicate key/);
    await rejects(as(db, anna, (q) => q("insert into baptista.budgets (household_id, monthly_amount) values ($1, 0)", [h2])), /check constraint|row-level security/);
    assert.equal(await count(carla, "select * from baptista.budgets where household_id = $1", [h1]), 0);
  });

  test("spending goals keep the first estimate; lines are validated; expenses link to them", async () => {
    const goal = await insertOne(
      anna,
      `insert into baptista.finance_goals (household_id, title, estimate_lines)
       values ($1, 'Vacanza in Puglia', '[{"id":"a","label":"Volo","amount":300},{"id":"b","label":"Hotel","amount":700.5}]')`,
      [h1],
    );
    await as(db, bruno, (q) =>
      q(`update baptista.finance_goals set estimate_lines = '[{"id":"a","label":"Volo","amount":350}]' where id = $1`, [goal]),
    );
    const [row] = await as(db, anna, (q) =>
      q<{ initial: string; current: string }>(
        "select initial_estimate as initial, baptista.estimate_total(estimate_lines) as current from baptista.finance_goals where id = $1",
        [goal],
      ),
    );
    assert.deepEqual({ initial: Number(row.initial), current: Number(row.current) }, { initial: 1000.5, current: 350 });
    await rejects(as(db, anna, (q) => q("update baptista.finance_goals set initial_estimate = 1 where id = $1", [goal])), /permission denied/);
    await rejects(
      as(db, anna, (q) => q(`update baptista.finance_goals set estimate_lines = '[{"id":"a","label":"Volo","amount":-1}]' where id = $1`, [goal])),
      /check constraint/,
    );
    await rejects(
      as(db, anna, (q) => q(`update baptista.finance_goals set estimate_lines = '[{"id":"a","label":"Volo"}]' where id = $1`, [goal])),
      /check constraint/,
    );
    await insertOne(anna, "insert into baptista.expenses (household_id, merchant, occurred_on, currency, total, goal_id) values ($1, 'Ryanair', '2026-09-11', 'EUR', 320, $2)", [h1, goal]);
    assert.equal(await count(bruno, "select * from baptista.expenses where goal_id = $1", [goal]), 1);
  });
});

describe("guardaroba — items and private photos", () => {
  const bucket = "baptista-wardrobe";
  const path = (h: string, u: User, file: string, upload = "11111111-1111-4111-8111-111111111111") => `${h}/${u.id}/${upload}/${file}`;
  async function upload(user: User, name: string) {
    await as(db, user, (q) => q("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]));
  }
  async function canRead(user: User, name: string) {
    return (await count(user, "select * from storage.objects where bucket_id = $1 and name = $2", [bucket, name])) === 1;
  }

  test("the bucket is private and limited to images up to 10 MB", async () => {
    const [b] = await as(db, "admin", (q) =>
      q<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>("select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]),
    );
    assert.equal(b.public, false);
    assert.equal(Number(b.file_size_limit), 10485760);
    assert.deepEqual(b.allowed_mime_types, ["image/jpeg", "image/png", "image/webp"]);
  });

  test("uploads only into your own folder of a household you belong to", async () => {
    await upload(anna, path(h1, anna, "original.jpg"));
    await rejects(upload(bruno, path(h1, anna, "x.jpg", "22222222-2222-4222-8222-222222222222")), /row-level security/);
    await rejects(upload(carla, path(h1, carla, "x.jpg")), /row-level security/);
    await rejects(upload(anna, `${h1}/${anna.id}/x.jpg`), /row-level security/);
    await rejects(upload(anna, `not-a-uuid/${anna.id}/u/x.jpg`), /row-level security/);
    await rejects(
      as(db, anna, (q) => q("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [path(h1, anna, "a.jpg")])),
      /row-level security|foreign key/,
    );
  });

  test("a photo is readable by the uploader, then by whoever can read the item", async () => {
    const original = path(h1, anna, "original.jpg");
    const thumb = path(h1, anna, "thumb.webp");
    await upload(anna, thumb);
    assert.equal(await canRead(anna, original), true);
    assert.equal(await canRead(bruno, original), false, "not yet attached to an item");

    const item = await insertOne(
      anna,
      "insert into baptista.wardrobe_items (household_id, name, type, original_path, thumb_path, seasons) values ($1, 'Giacca blu', 'outerwear', $2, $3, '{autumn,winter}')",
      [h1, original, thumb],
    );
    assert.equal(await canRead(bruno, original), true);
    assert.equal(await canRead(bruno, thumb), true);
    assert.equal(await canRead(carla, original), false);

    await as(db, anna, (q) => q("update baptista.wardrobe_items set visibility = 'private' where id = $1", [item]));
    assert.equal(await canRead(bruno, thumb), false, "private item hides its photos");
    assert.equal(await canRead(anna, thumb), true);
    await as(db, anna, (q) => q("update baptista.wardrobe_items set visibility = 'household' where id = $1", [item]));

    const events = await as(db, anna, (q) => q<{ event_type: string }>("select event_type from baptista.events where source_id = $1", [item]));
    assert.deepEqual(events.map((e) => e.event_type), ["wardrobe.item_added"]);
  });

  test("items cannot point at someone else's photo or another household", async () => {
    await upload(bruno, path(h1, bruno, "b.jpg", "33333333-3333-4333-8333-333333333333"));
    await rejects(
      as(db, anna, (q) =>
        q("insert into baptista.wardrobe_items (household_id, name, type, original_path, thumb_path) values ($1, 'x', 'top', $2, $2)", [
          h1,
          path(h1, bruno, "b.jpg", "33333333-3333-4333-8333-333333333333"),
        ]),
      ),
      /forbidden/,
    );
    await rejects(
      as(db, anna, (q) =>
        q("insert into baptista.wardrobe_items (household_id, name, type, original_path, thumb_path) values ($1, 'x', 'top', $2, $2)", [h1, path(h2, anna, "y.jpg")]),
      ),
      /check constraint/,
    );
    await rejects(
      as(db, anna, (q) => q("insert into baptista.wardrobe_items (household_id, name, type, seasons) values ($1, 'x', 'top', '{monsoon}')", [h1])),
      /check constraint/,
    );
    await rejects(
      as(db, anna, (q) => q("insert into baptista.wardrobe_items (household_id, name, type, original_path) values ($1, 'x', 'top', $2)", [h1, path(h1, anna, "o.jpg")])),
      /check constraint/,
    );
  });

  test("photos are deleted by whoever can delete the item; strangers and private items are protected", async () => {
    const original = path(h1, anna, "original.jpg");
    const del = async (user: User, name = original) =>
      (await as(db, user, (q) => q("delete from storage.objects where bucket_id = $1 and name = $2 returning id", [bucket, name]))).length;
    assert.equal(await del(carla), 0);
    const priv = path(h1, anna, "secret.jpg", "44444444-4444-4444-8444-444444444444");
    await upload(anna, priv);
    await as(db, anna, (q) =>
      q("insert into baptista.wardrobe_items (household_id, name, type, original_path, thumb_path, visibility) values ($1, 'Privato', 'top', $2, $2, 'private')", [h1, priv]),
    );
    assert.equal(await del(bruno, priv), 0, "private item: other members cannot touch the photo");
    assert.equal(await del(bruno), 1, "household item: a member removes its photo, then the item");
    await as(db, bruno, (q) => q("delete from baptista.wardrobe_items where original_path = $1", [original]));
  });
});
