import { strict as assert } from "node:assert";
import { before, describe, test } from "node:test";
import { as, createDb, createUser, rejects, type Db } from "./harness";

/** Phase 04.1 — connections between rooms (step A) and Baptista presentation memory (step B). */

type User = { id: string; email: string };
type Q = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;

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

async function one<R>(user: User | "admin", sql: string, params: unknown[] = []) {
  const [row] = await as(db, user, (q: Q) => q<R>(sql, params));
  return row;
}

async function refresh(household = h1, now = new Date().toISOString()) {
  await as(db, "admin", (q) => q("select baptista._refresh_observations($1, $2)", [household, now]));
}

async function observations(user: User, type: string, household = h1) {
  return as(db, user, (q) =>
    q<{ id: string; title: string; description: string; source_id: string; dedupe_key: string; data: Record<string, unknown> }>(
      "select id, title, description, source_id, dedupe_key, data from baptista.observations where household_id = $1 and type = $2 and state = 'active' order by created_at",
      [household, type],
    ),
  );
}

async function addItem(user: User, kind: "food" | "other", name: string, extra: { barcode?: string; quantity?: number; unit?: string; storage?: string } = {}) {
  const row = await one<{ id: string }>(
    user,
    "select baptista.add_shopping_item($1, $2, $3, $4, $5, $6, null, null, $7) as id",
    [h1, kind, name, extra.quantity ?? null, extra.unit ?? null, extra.barcode ?? null, extra.storage ?? null],
  );
  return row.id;
}

async function stock(user: User, ids: string[], bulk: boolean) {
  const row = await one<{ r: { batch_id: string | null; items: Array<{ id: string; food_item_id: string }> } }>(
    user,
    "select baptista.stock_shopping_items($1, $2::uuid[], $3) as r",
    [h1, ids, bulk],
  );
  return row.r;
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

describe("A-1 lista della spesa", () => {
  test("one shared list: rows are always household, strangers see nothing", async () => {
    const milk = await addItem(anna, "food", "Latte", { storage: "fridge" });
    const soap = await addItem(bruno, "other", "Detersivo");
    const seen = await as(db, bruno, (q) => q<{ id: string }>("select id from baptista.shopping_items where household_id = $1", [h1]));
    assert.deepEqual(new Set(seen.map((r) => r.id)), new Set([milk, soap]));
    assert.equal((await as(db, carla, (q) => q("select id from baptista.shopping_items where household_id = $1", [h1]))).length, 0);
    assert.equal((await as(db, anna, (q) => q("select id from baptista.shopping_items where household_id = $1", [h2]))).length, 0);
    await rejects(
      as(db, anna, (q) => q("insert into baptista.shopping_items (household_id, kind, name, visibility) values ($1, 'other', 'x', 'private')", [h1])),
      /permission denied/,
    );
    await rejects(as(db, carla, (q) => q("select baptista.add_shopping_item($1, 'other', 'x')", [h1])), /row-level security/);
    // «Altro» never carries food data; food always has a place.
    await rejects(
      as(db, anna, (q) => q("insert into baptista.shopping_items (household_id, kind, name, barcode) values ($1, 'other', 'x', '12345678')", [h1])),
      /check constraint/,
    );
  });

  test("adding the same product again increases the quantity instead of duplicating", async () => {
    const first = await addItem(anna, "food", "Uova", { quantity: 6, unit: "pz" });
    const again = await addItem(bruno, "food", "  uova ", { quantity: 6, unit: "pz" });
    assert.equal(again, first);
    const row = await one<{ quantity: string; n: number }>(
      anna,
      "select quantity, (select count(*)::int from baptista.shopping_items where household_id = $1 and name_key = 'uova' and status = 'open') as n from baptista.shopping_items where id = $2",
      [h1, first],
    );
    assert.equal(Number(row.quantity), 12);
    assert.equal(row.n, 1);
    const byCode = await addItem(anna, "food", "Biscotti", { barcode: "8000500310427" });
    assert.equal(await addItem(anna, "food", "Biscotti al cacao", { barcode: "8000500310427" }), byCode);
  });

  test("ticking a food stocks it once (idempotent), creates the pantry item and an event with bulk=false", async () => {
    const id = await addItem(anna, "food", "Yogurt greco", { storage: "fridge", quantity: 2, unit: "pz" });
    const first = await stock(anna, [id], false);
    assert.equal(first.items.length, 1);
    const again = await stock(anna, [id], false);
    assert.equal(again.items.length, 0, "double tap does nothing");
    assert.equal(again.batch_id, null);
    const food = await one<{ product_name: string; storage: string; quantity: string; visibility: string; owner_user_id: string }>(
      bruno,
      "select product_name, storage, quantity, visibility, owner_user_id from baptista.food_items where id = $1",
      [first.items[0].food_item_id],
    );
    assert.deepEqual([food.product_name, food.storage, Number(food.quantity), food.visibility], ["Yogurt greco", "fridge", 2, "household"]);
    assert.equal(food.owner_user_id, anna.id);
    const ev = await one<{ payload: { bulk: boolean } }>(anna, "select payload from baptista.events where event_type = 'shopping.items_stocked' and source_id = $1", [first.batch_id]);
    assert.equal(ev.payload.bulk, false);
    // Clients can never mark a row stocked by hand (no food would exist).
    const other = await addItem(anna, "food", "Farina");
    await rejects(as(db, anna, (q) => q("update baptista.shopping_items set status = 'stocked' where id = $1", [other])), /forbidden|check constraint/);
    await rejects(as(db, anna, (q) => q("update baptista.shopping_items set food_item_id = null where id = $1", [other])), /permission denied/);
  });

  test("«Tutto in dispensa» takes only the listed open food rows, never «Altro»; undo is version-checked", async () => {
    const pane = await addItem(bruno, "food", "Pane", { storage: "pantry" });
    const mele = await addItem(bruno, "food", "Mele", { storage: "fridge" });
    const carta = await addItem(bruno, "other", "Carta da forno");
    const result = await stock(bruno, [pane, mele, carta], true);
    assert.deepEqual(new Set(result.items.map((i) => i.id)), new Set([pane, mele]));
    const status = await one<{ status: string }>(bruno, "select status from baptista.shopping_items where id = $1", [carta]);
    assert.equal(status.status, "open", "«Altro» is never stocked");
    const ev = await one<{ payload: { bulk: boolean; count: number } }>(bruno, "select payload from baptista.events where source_id = $1", [result.batch_id]);
    assert.deepEqual(ev.payload, { bulk: true, count: 2 });

    // Someone changes the bread: undo is refused for the whole batch.
    const breadFood = result.items.find((i) => i.id === pane)!.food_item_id;
    await as(db, anna, (q) => q("update baptista.food_items set quantity = 2 where id = $1", [breadFood]));
    await rejects(as(db, bruno, (q) => q("select baptista.unstock_shopping_items($1, $2::uuid[])", [h1, [pane, mele]])), /conflict/);
    // The untouched apples can be undone: the food disappears and the row reopens.
    const appleFood = result.items.find((i) => i.id === mele)!.food_item_id;
    await as(db, bruno, (q) => q("select baptista.unstock_shopping_items($1, $2::uuid[])", [h1, [mele]]));
    assert.equal((await as(db, anna, (q) => q("select id from baptista.food_items where id = $1", [appleFood]))).length, 0);
    const reopened = await one<{ status: string; food_item_id: string | null }>(anna, "select status, food_item_id from baptista.shopping_items where id = $1", [mele]);
    assert.deepEqual(reopened, { status: "open", food_item_id: null });
    await rejects(as(db, carla, (q) => q("select baptista.stock_shopping_items($1, $2::uuid[], true)", [h1, [mele]])), /forbidden/);
  });

  test("«Altro» rows can be done and reopened by hand", async () => {
    const id = await addItem(anna, "other", "Lampadine");
    await as(db, bruno, (q) => q("update baptista.shopping_items set status = 'done' where id = $1", [id]));
    await as(db, bruno, (q) => q("update baptista.shopping_items set status = 'open' where id = $1", [id]));
    const food = await addItem(anna, "food", "Riso");
    await rejects(as(db, anna, (q) => q("update baptista.shopping_items set status = 'done' where id = $1", [food])), /check constraint/);
  });
});

describe("A-3 connection questions", () => {
  test("C1: only «Tutto in dispensa» asks to record the expense, to who did it; registering resolves it", async () => {
    const single = await addItem(anna, "food", "Basilico", { storage: "fridge" });
    await stock(anna, [single], false);
    const a = await addItem(anna, "food", "Pomodori", { storage: "fridge" });
    const b = await addItem(anna, "food", "Mozzarella di bufala", { storage: "fridge" });
    const batch = await stock(anna, [a, b], true);
    await refresh();
    const questions = await observations(anna, "shopping_expense_question");
    assert.equal(questions.length, 1, "the single tick never asks");
    assert.equal(questions[0].source_id, batch.batch_id);
    assert.equal(questions[0].data.count, 2);
    assert.equal((await observations(bruno, "shopping_expense_question")).filter((o) => o.source_id === batch.batch_id).length, 0, "only the actor is asked");

    const lines = { [a]: 3.2 };
    const expense = await one<{ id: string }>(
      anna,
      "select baptista.register_shopping_expense($1, $2, 12.5, 'EUR', '2026-10-10', 'Mercato', 'household', $3::jsonb) as id",
      [h1, batch.batch_id, JSON.stringify(lines)],
    );
    const items = await as(db, anna, (q) => q<{ description: string; line_total: string }>("select description, line_total from baptista.expense_items where expense_id = $1", [expense.id]));
    assert.deepEqual(items.map((i) => [i.description, Number(i.line_total)]), [["Pomodori", 3.2]], "only typed amounts become lines");
    const cat = await one<{ name: string; total: string }>(
      anna,
      "select c.name, e.total from baptista.expenses e join baptista.expense_categories c on c.id = e.category_id where e.id = $1",
      [expense.id],
    );
    assert.deepEqual([cat.name, Number(cat.total)], ["Spesa alimentare", 12.5]);
    await refresh();
    assert.equal((await observations(anna, "shopping_expense_question")).length, 0);
    await rejects(
      as(db, anna, (q) => q("select baptista.register_shopping_expense($1, $2, 1, 'EUR', '2026-10-10', null, 'household')", [h1, batch.batch_id])),
      /not_found/,
    );
  });

  test("C2: a finished food asks to restock (actor only); adding it to the list resolves the question", async () => {
    const food = await one<{ id: string }>(anna, "insert into baptista.food_items (household_id, product_name, barcode) values ($1, 'Burro', '8001234567890') returning id", [h1]);
    await as(db, bruno, (q) => q("update baptista.food_items set status = 'consumed' where id = $1", [food.id]));
    await refresh();
    assert.equal((await observations(bruno, "restock_question")).length, 1);
    assert.equal((await observations(anna, "restock_question")).length, 0);
    await addItem(bruno, "food", "Burro", { barcode: "8001234567890" });
    await refresh();
    assert.equal((await observations(bruno, "restock_question")).length, 0);
  });

  test("C4: consumed food with known kcal asks the actor about the diary", async () => {
    const food = await one<{ id: string }>(anna, "insert into baptista.food_items (household_id, product_name, kcal_100g) values ($1, 'Banana', 89) returning id", [h1]);
    await as(db, anna, (q) => q("update baptista.food_items set status = 'consumed' where id = $1", [food.id]));
    const noKcal = await one<{ id: string }>(anna, "insert into baptista.food_items (household_id, product_name) values ($1, 'Pesca') returning id", [h1]);
    await as(db, anna, (q) => q("update baptista.food_items set status = 'consumed' where id = $1", [noKcal.id]));
    await refresh();
    const asks = await observations(anna, "diet_log_question");
    assert.deepEqual(asks.map((o) => o.source_id), [food.id]);
  });

  test("«already in the pantry» matches by barcode or name key and disappears after consumption", async () => {
    const food = await one<{ id: string }>(anna, "insert into baptista.food_items (household_id, product_name) values ($1, 'Caffè') returning id", [h1]);
    const check = (key: string) => one<{ yes: boolean }>("admin", "select baptista.in_pantry($1, $2, null) as yes", [h1, key]);
    assert.equal((await check("caffe")).yes, true, "accents folded");
    await as(db, anna, (q) => q("update baptista.food_items set status = 'consumed' where id = $1", [food.id]));
    assert.equal((await check("caffe")).yes, false);
  });

  test("C8: staple suggested after 3 stockings in 60 days, never after «No»; missing staples grouped", async () => {
    for (let i = 0; i < 3; i += 1) {
      const id = await addItem(anna, "food", "Latte intero", { storage: "fridge" });
      await stock(anna, [id], false);
    }
    const yogurtIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const id = await addItem(anna, "food", "Kefir", { storage: "fridge" });
      yogurtIds.push(id);
      await stock(anna, [id], false);
    }
    await refresh();
    const suggestions = await observations(bruno, "staple_suggestion");
    assert.deepEqual(new Set(suggestions.map((s) => s.data.name)), new Set(["Latte intero", "Kefir"]));
    await as(db, bruno, (q) => q("select baptista.set_pantry_staple($1, 'Kefir', null, 'declined')", [h1]));
    await as(db, anna, (q) => q("select baptista.set_pantry_staple($1, 'Latte intero', null, 'staple')", [h1]));
    await as(db, anna, (q) => q("select baptista.set_pantry_staple($1, 'latte  intero', null, 'staple')", [h1]));
    assert.equal((await one<{ n: number }>(anna, "select count(*)::int as n from baptista.pantry_staples where household_id = $1", [h1])).n, 2, "one row per product");
    await rejects(as(db, carla, (q) => q("select baptista.set_pantry_staple($1, 'x', null, 'staple')", [h1])), /row-level security/);
    await refresh();
    assert.equal((await observations(bruno, "staple_suggestion")).length, 0, "answered either way, never asked again");

    // Staple still in the pantry: not missing. Consume every unit: missing, and C2 stays quiet.
    assert.equal((await observations(anna, "staples_missing")).length, 0);
    const milks = await as(db, anna, (q) => q<{ id: string }>("select id from baptista.food_items where household_id = $1 and product_name = 'Latte intero' and status = 'available'", [h1]));
    for (const m of milks) await as(db, anna, (q) => q("update baptista.food_items set status = 'consumed' where id = $1", [m.id]));
    await refresh();
    const missing = await observations(bruno, "staples_missing");
    assert.equal(missing.length, 1);
    assert.match(missing[0].title, /Manca un prodotto abituale: Latte intero/);
    assert.equal((await observations(anna, "restock_question")).filter((o) => String(o.title).startsWith("Latte intero")).length, 0);
    await addItem(bruno, "food", "Latte intero", { storage: "fridge" });
    await refresh();
    assert.equal((await observations(bruno, "staples_missing")).length, 0, "on the list: no longer missing");
  });

  test("C3 dedupe: adding recipe ingredients never duplicates open rows", async () => {
    const before = await one<{ n: number }>(anna, "select count(*)::int as n from baptista.shopping_items where household_id = $1 and status = 'open'", [h1]);
    await addItem(anna, "food", "Farina");
    await addItem(anna, "food", "farina");
    const after = await one<{ n: number }>(anna, "select count(*)::int as n from baptista.shopping_items where household_id = $1 and status = 'open'", [h1]);
    assert.equal(after.n, before.n, "Farina was already open on the list");
  });
});

describe("A-2 wardrobe acquisition", () => {
  async function item(user: User, name: string, visibility = "household") {
    return (await one<{ id: string }>(user, "insert into baptista.wardrobe_items (household_id, name, type, visibility) values ($1, $2, 'top', $3) returning id", [h1, name, visibility])).id;
  }

  test("a new item asks its owner only; a purchase with price creates one linked expense", async () => {
    const shirt = await item(anna, "Camicia di lino");
    await refresh();
    assert.equal((await observations(anna, "wardrobe_acquisition")).length, 1);
    assert.equal((await observations(bruno, "wardrobe_acquisition")).length, 0);

    const expense = await one<{ id: string }>(
      anna,
      "select baptista.register_wardrobe_purchase($1, 1, 49.9, 'EUR', '2026-10-09', 'Negozio', 'private') as id",
      [shirt],
    );
    const replay = await one<{ id: string }>(anna, "select baptista.register_wardrobe_purchase($1, 2, 49.9, 'EUR', '2026-10-09', null, 'private') as id", [shirt]);
    assert.equal(replay.id, expense.id, "a replay never creates a second expense");
    const rows = await as(db, anna, (q) => q<{ total: string; visibility: string; name: string }>(
      "select e.total, e.visibility, c.name from baptista.expenses e join baptista.expense_categories c on c.id = e.category_id where e.id = $1",
      [expense.id],
    ));
    assert.deepEqual(rows.map((r) => [Number(r.total), r.visibility, r.name]), [[49.9, "private", "Abbigliamento"]]);
    const linked = await one<{ acquisition: string; expense_id: string }>(anna, "select acquisition, expense_id from baptista.wardrobe_items where id = $1", [shirt]);
    assert.deepEqual(linked, { acquisition: "purchased", expense_id: expense.id });
    await refresh();
    assert.equal((await observations(anna, "wardrobe_acquisition")).length, 0, "answered: resolved");
    // C5 does not ask about an expense already linked to an item.
    assert.equal((await observations(anna, "wardrobe_from_expense")).length, 0);
  });

  test("no price: purchased without any expense; strangers and stale versions refused", async () => {
    const scarf = await item(anna, "Sciarpa");
    const none = await one<{ id: string | null }>(anna, "select baptista.register_wardrobe_purchase($1, 1, null, 'EUR', null, null, null) as id", [scarf]);
    assert.equal(none.id, null);
    const row = await one<{ acquisition: string; expense_id: string | null }>(anna, "select acquisition, expense_id from baptista.wardrobe_items where id = $1", [scarf]);
    assert.deepEqual(row, { acquisition: "purchased", expense_id: null });
    const hat = await item(anna, "Cappello", "private");
    await rejects(as(db, bruno, (q) => q("select baptista.register_wardrobe_purchase($1, 1, 10, 'EUR', null, null, null)", [hat])), /not_found/);
    await rejects(as(db, anna, (q) => q("select baptista.register_wardrobe_purchase($1, 9, 10, 'EUR', null, null, null)", [hat])), /conflict/);
  });

  test("«Erano già miei» in bulk: at least 7 own unanswered items, all or nothing, also when called directly", async () => {
    const mine: string[] = [];
    for (let i = 0; i < 8; i += 1) mine.push(await item(bruno, `Maglia ${i}`));
    await rejects(as(db, bruno, (q) => q("select baptista.mark_wardrobe_owned_before($1, $2::uuid[])", [h1, mine.slice(0, 6)])), /too_few/);
    // Duplicated ids do not count twice.
    await rejects(
      as(db, bruno, (q) => q("select baptista.mark_wardrobe_owned_before($1, $2::uuid[])", [h1, [...mine.slice(0, 6), mine[0]]])),
      /too_few/,
    );
    const annas = await item(anna, "Maglia di Anna");
    await rejects(
      as(db, bruno, (q) => q("select baptista.mark_wardrobe_owned_before($1, $2::uuid[])", [h1, [...mine.slice(0, 6), annas]])),
      /conflict/,
    );
    const states = await as(db, bruno, (q) => q<{ acquisition: string }>("select acquisition from baptista.wardrobe_items where id = any($1::uuid[])", [mine]));
    assert.ok(states.every((s) => s.acquisition === "unknown"), "nothing changed on refusal");
    const done = await one<{ n: number }>(bruno, "select baptista.mark_wardrobe_owned_before($1, $2::uuid[]) as n", [h1, mine.slice(0, 7)]);
    assert.equal(done.n, 7);
    await rejects(as(db, bruno, (q) => q("select baptista.mark_wardrobe_owned_before($1, $2::uuid[])", [h1, mine])), /conflict/);
  });

  test("C5: a clothing expense asks to add the item; an item born from it is a purchase", async () => {
    await as(db, anna, (q) => q("select baptista.ensure_expense_categories($1)", [h1]));
    const cat = await one<{ id: string }>(anna, "select id from baptista.expense_categories where household_id = $1 and name = 'Abbigliamento'", [h1]);
    const exp = await one<{ id: string }>(
      anna,
      "insert into baptista.expenses (household_id, description, occurred_on, currency, total, category_id) values ($1, 'Scarpe', '2026-10-09', 'EUR', 80, $2) returning id",
      [h1, cat.id],
    );
    await refresh();
    assert.equal((await observations(anna, "wardrobe_from_expense")).length, 1);
    const shoes = await one<{ acquisition: string }>(
      anna,
      "insert into baptista.wardrobe_items (household_id, name, type, expense_id) values ($1, 'Scarpe', 'shoes', $2) returning acquisition",
      [h1, exp.id],
    );
    assert.equal(shoes.acquisition, "purchased");
    await refresh();
    assert.equal((await observations(anna, "wardrobe_from_expense")).length, 0);
    assert.equal((await observations(anna, "wardrobe_acquisition")).filter((o) => o.title && o.description === "Scarpe").length, 0);
    // A private expense of someone else cannot be linked.
    const secret = await one<{ id: string }>(
      bruno,
      "insert into baptista.expenses (household_id, description, occurred_on, currency, total, visibility) values ($1, 'Segreto', '2026-10-09', 'EUR', 5, 'private') returning id",
      [h1],
    );
    await rejects(
      as(db, anna, (q) => q("insert into baptista.wardrobe_items (household_id, name, type, expense_id) values ($1, 'x', 'top', $2)", [h1, secret.id])),
      /not_found/,
    );
  });
});

describe("C6 budgets and C9 linked goals", () => {
  test("budget: 80% then 100% replaces it; private expenses never count in the shared card", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await as(db, anna, (q) => q("select baptista.ensure_expense_categories($1)", [h1]));
    const cat = await one<{ id: string }>(anna, "select id from baptista.expense_categories where household_id = $1 and name = 'Svago'", [h1]);
    await as(db, anna, (q) => q("insert into baptista.budgets (household_id, category_id, currency, monthly_amount) values ($1, $2, 'EUR', 100)", [h1, cat.id]));
    const spend = (user: User, total: number, visibility = "household") =>
      as(db, user, (q) =>
        q("insert into baptista.expenses (household_id, description, occurred_on, currency, total, category_id, visibility) values ($1, 'Cinema', $2, 'EUR', $3, $4, $5)", [h1, today, total, cat.id, visibility]),
      );
    await spend(bruno, 500, "private");
    await refresh();
    assert.equal((await observations(anna, "budget_threshold")).length, 0, "a private expense does not feed the shared card");
    await spend(anna, 85);
    await refresh();
    const eighty = await observations(bruno, "budget_threshold");
    assert.equal(eighty.length, 1);
    assert.match(eighty[0].title, /^Svago: 85% del budget$/);
    await spend(anna, 20);
    await refresh();
    const hundred = await observations(bruno, "budget_threshold");
    assert.equal(hundred.length, 1);
    assert.equal(hundred[0].title, "Svago: budget del mese superato");
  });

  test("a goal linked to a habit follows its entries and refuses manual progress", async () => {
    const habit = await one<{ id: string }>(anna, "insert into baptista.habits (household_id, title, target_per_week, starts_on) values ($1, 'Corsa', 3, '2026-01-01') returning id", [h1]);
    const goal = await one<{ id: string; current_value: string }>(
      anna,
      "insert into baptista.goals (household_id, title, target_value, habit_id) values ($1, '50 corse', 50, $2) returning id, current_value",
      [h1, habit.id],
    );
    assert.equal(Number(goal.current_value), 0);
    const today = new Date().toISOString().slice(0, 10);
    await as(db, bruno, (q) => q("insert into baptista.habit_entries (household_id, habit_id, performed_on) values ($1, $2, $3)", [h1, habit.id, today]));
    const after = await one<{ current_value: string }>(anna, "select current_value from baptista.goals where id = $1", [goal.id]);
    assert.equal(Number(after.current_value), 1);
    const events = await as(db, anna, (q) => q("select 1 from baptista.events where source_id = $1 and event_type = 'goal.progress_changed'", [goal.id]));
    assert.equal(events.length, 1);
    await rejects(as(db, anna, (q) => q("update baptista.goals set current_value = 10 where id = $1", [goal.id])), /linked_goal/);
    await as(db, bruno, (q) => q("delete from baptista.habit_entries where habit_id = $1", [habit.id]));
    assert.equal(Number((await one<{ current_value: string }>(anna, "select current_value from baptista.goals where id = $1", [goal.id])).current_value), 0);

    // A shared goal cannot follow a private habit.
    const secret = await one<{ id: string }>(anna, "insert into baptista.habits (household_id, title, target_per_week, visibility) values ($1, 'Segreta', 2, 'private') returning id", [h1]);
    await rejects(
      as(db, anna, (q) => q("insert into baptista.goals (household_id, title, target_value, habit_id) values ($1, 'x', 5, $2)", [h1, secret.id])),
      /forbidden/,
    );
    await rejects(
      as(db, bruno, (q) => q("insert into baptista.goals (household_id, title, target_value, habit_id, visibility) values ($1, 'x', 5, $2, 'private')", [h1, secret.id])),
      /not_found/,
    );
  });
});

describe("B-7 detectors", () => {
  test("calendar overlap within 48 h; private pairs only for their owner", async () => {
    const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    const insert = (user: User, title: string, from: number, to: number, visibility = "household") =>
      as(db, user, (q) =>
        q("insert into baptista.calendar_events (household_id, title, starts_at, ends_at, visibility) values ($1, $2, $3, $4, $5)", [h1, title, at(from), at(to), visibility]),
      );
    await insert(anna, "Dentista", 5, 6);
    await insert(bruno, "Riunione", 5.5, 7);
    await insert(anna, "Palestra", 30, 31, "private");
    await insert(bruno, "Cena", 30.5, 32);
    await insert(anna, "Lontano", 60, 61);
    await insert(bruno, "Lontano 2", 60, 61);
    await refresh();
    const forBruno = await observations(bruno, "calendar_overlap");
    assert.deepEqual(forBruno.map((o) => o.title), ["Dentista e Riunione si sovrappongono"]);
    const forAnna = await observations(anna, "calendar_overlap");
    assert.equal(forAnna.length, 2, "Anna also sees the overlap with her private event");
  });

  test("food opened for 3+ days in the fridge, with checking language", async () => {
    await as(db, anna, (q) => q("insert into baptista.food_items (household_id, product_name, status, opened_on) values ($1, 'Passata', 'opened', current_date - 4)", [h1]));
    await refresh();
    const opened = await observations(anna, "food_opened");
    assert.equal(opened.length, 1);
    assert.match(opened[0].description, /non un'indicazione sulla sicurezza/);
  });
});

describe("B-4 presentation memory", () => {
  test("self-only, counted at most once per window, snooze and outcome kept", async () => {
    const rec = (user: User, key: string, outcome: string | null = null, snooze: string | null = null) =>
      as(db, user, (q) => q("select baptista.record_presentation($1, $2, null, 'v1', $3, $4)", [h1, key, outcome, snooze]));
    await rec(anna, "obs:test:1");
    await rec(anna, "obs:test:1");
    const row = await one<{ show_count: number; outcome: string }>(anna, "select show_count, outcome from baptista.baptista_presentations where key = 'obs:test:1'");
    assert.deepEqual(row, { show_count: 1, outcome: "shown" });
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await rec(anna, "obs:test:1", "snoozed", later);
    const snoozed = await one<{ outcome: string; snoozed_until: string }>(anna, "select outcome, snoozed_until from baptista.baptista_presentations where key = 'obs:test:1'");
    assert.equal(snoozed.outcome, "snoozed");
    assert.ok(snoozed.snoozed_until);
    assert.equal((await as(db, bruno, (q) => q("select * from baptista.baptista_presentations where household_id = $1", [h1]))).length, 0, "a member never sees another's memory");
    await rejects(as(db, carla, (q) => q("select baptista.record_presentation($1, 'obs:x')", [h1])), /forbidden/);
    await rejects(
      as(db, bruno, (q) => q("insert into baptista.baptista_presentations (household_id, user_id, key) values ($1, $2, 'obs:x')", [h1, anna.id])),
      /permission denied/,
    );
  });
});
