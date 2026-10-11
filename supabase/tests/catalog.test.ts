import { strict as assert } from "node:assert";
import { before, describe, test } from "node:test";
import { as, createDb, createUser, rejects, type Db } from "./harness";

/** D31 — household food catalog, cookbook recipes and meals made of catalog foods. */

type User = { id: string; email: string };

let db: Db;
let anna: User;
let bruno: User;
let carla: User;
let h1: string;
let h2: string;

async function one<R>(user: User | "admin", sql: string, params: unknown[] = []) {
  const [row] = await as(db, user, (q) => q<R>(sql, params));
  return row;
}

const food = async (user: User, household: string, name: string, brand: string | null = null, barcode: string | null = null, kcal: number | null = null) =>
  (await one<{ id: string }>(user, "select baptista.ensure_food($1, $2, $3, $4, null, null, $5) as id", [household, name, brand, barcode, kcal])).id;

before(async () => {
  db = await createDb();
  anna = await createUser(db, "Anna");
  bruno = await createUser(db, "Bruno");
  carla = await createUser(db, "Carla");
  h1 = (await one<{ id: string }>(anna, "select baptista.create_household('Casa Rossi', 'Europe/Rome') as id")).id;
  h2 = (await one<{ id: string }>(carla, "select baptista.create_household('Casa Bianchi', 'Europe/Rome') as id")).id;
  await as(db, anna, (q) => q("select baptista.invite_member($1, $2)", [h1, bruno.email]));
  await as(db, bruno, (q) => q("select baptista.respond_to_invite($1, true)", [h1]));
});

describe("food catalog", () => {
  test("one catalog per household: deduplicated by barcode, else by name and brand", async () => {
    const a = await food(anna, h1, "Latte intero", "Granarolo", "8002670500018", 64);
    assert.equal(await food(bruno, h1, "Latte Granarolo", null, "8002670500018"), a, "same barcode, same food");
    const plain = await food(anna, h1, "Pane");
    assert.equal(await food(bruno, h1, "  pane "), plain, "same name key, same food");
    assert.notEqual(await food(anna, h1, "Pane", "Mulino Bianco"), plain, "a different brand is a different food");
    assert.equal((await as(db, carla, (q) => q("select id from baptista.foods where household_id = $1", [h1]))).length, 0);
    await rejects(as(db, carla, (q) => q("select baptista.ensure_food($1, 'x')", [h1])), /row-level security/);
    const row = await one<{ default_storage: string; nutrition_source: string | null }>(anna, "select default_storage, nutrition_source from baptista.foods where id = $1", [a]);
    assert.equal(row.nutrition_source, "manual", "nutrition typed without source is manual");
  });

  test("pantry items are always catalog foods; name and nutrition come from the catalog", async () => {
    const yogurt = await food(anna, h1, "Yogurt", null, null, 60);
    const item = await one<{ id: string; product_name: string; kcal_100g: string }>(
      bruno,
      "insert into baptista.food_items (household_id, food_id, storage) values ($1, $2, 'fridge') returning id, product_name, kcal_100g",
      [h1, yogurt],
    );
    assert.deepEqual([item.product_name, Number(item.kcal_100g)], ["Yogurt", 60]);
    await rejects(as(db, bruno, (q) => q("update baptista.food_items set product_name = 'Altro' where id = $1", [item.id])), /permission denied/);
    const kefir = await food(anna, h1, "Kefir");
    await rejects(as(db, bruno, (q) => q("update baptista.food_items set food_id = $2 where id = $1", [item.id, kefir])), /immutable_field|permission denied/);

    // Editing the catalog reaches the item still in the house.
    await as(db, anna, (q) => q("update baptista.foods set name = 'Yogurt greco', kcal_100g = 97 where id = $1", [yogurt]));
    const after = await one<{ product_name: string; kcal_100g: string }>(anna, "select product_name, kcal_100g from baptista.food_items where id = $1", [item.id]);
    assert.deepEqual([after.product_name, Number(after.kcal_100g)], ["Yogurt greco", 97]);

    // A food of another household cannot be used; a food in use cannot be deleted.
    const foreign = await food(carla, h2, "Segreto");
    await rejects(as(db, anna, (q) => q("insert into baptista.food_items (household_id, food_id) values ($1, $2)", [h1, foreign])), /not_found|foreign key/);
    await rejects(as(db, anna, (q) => q("delete from baptista.foods where id = $1", [yogurt])), /foreign key/);
    const unused = await food(anna, h1, "Mai usato");
    await as(db, anna, (q) => q("delete from baptista.foods where id = $1", [unused]));
  });

  test("list rows of kind food reference the catalog and take its default place", async () => {
    const peas = (await one<{ id: string }>(anna, "select baptista.ensure_food($1, 'Piselli', null, null, 'frozen') as id", [h1])).id;
    const row = (await one<{ id: string }>(anna, "select baptista.add_shopping_item($1, 'food', null, 2, 'conf', $2) as id", [h1, peas])).id;
    const saved = await one<{ name: string; storage: string; food_id: string }>(anna, "select name, storage, food_id from baptista.shopping_items where id = $1", [row]);
    assert.deepEqual(saved, { name: "Piselli", storage: "freezer", food_id: peas });
    await rejects(as(db, anna, (q) => q("select baptista.add_shopping_item($1, 'food')", [h1])), /invalid/);
  });
});

describe("cookbook and meals", () => {
  let pasta: string;
  let garlic: string;
  let oil: string;

  before(async () => {
    pasta = await food(anna, h1, "Spaghetti", null, null, 359);
    garlic = await food(anna, h1, "Aglio");
    oil = await food(anna, h1, "Olio extravergine", null, null, 884);
  });

  test("recipes: catalog ingredients with optional quantities, private recipes stay private", async () => {
    const recipe = (await one<{ id: string }>(anna, "insert into baptista.recipes (household_id, title, servings, body) values ($1, 'Aglio, olio e peperoncino', 2, 'Soffriggere…') returning id", [h1])).id;
    const add = (user: User, foodId: string, amount: number | null, unit: string | null) =>
      as(db, user, (q) => q("insert into baptista.recipe_ingredients (household_id, recipe_id, food_id, amount, unit) values ($1, $2, $3, $4, $5)", [h1, recipe, foodId, amount, unit]));
    await add(anna, pasta, 200, "g");
    await add(bruno, garlic, 2, "spicchio");
    await add(anna, oil, null, "qb");
    await rejects(add(anna, pasta, 100, "g"), /duplicate key/);
    const salt = await food(anna, h1, "Sale");
    const pepper = await food(anna, h1, "Pepe");
    await rejects(add(anna, salt, null, "g"), /check constraint/);
    await rejects(add(anna, pepper, 1, "tazza"), /check constraint/);
    assert.equal((await as(db, carla, (q) => q("select id from baptista.recipe_ingredients where recipe_id = $1", [recipe]))).length, 0);

    const secret = (await one<{ id: string }>(anna, "insert into baptista.recipes (household_id, title, visibility) values ($1, 'Ricetta segreta', 'private') returning id", [h1])).id;
    assert.equal((await as(db, bruno, (q) => q("select id from baptista.recipes where id = $1", [secret]))).length, 0);
    await rejects(
      as(db, bruno, (q) => q("insert into baptista.recipe_ingredients (household_id, recipe_id, food_id) values ($1, $2, $3)", [h1, secret, pasta])),
      /row-level security/,
    );
  });

  test("a recipe joins a meal: weights become grams, the rest 0 g; repeated adds do not duplicate", async () => {
    const recipe = (await one<{ id: string }>(anna, "select id from baptista.recipes where title = 'Aglio, olio e peperoncino'")).id;
    const meal = (await one<{ id: string }>(bruno, "insert into baptista.meals (household_id, title) values ($1, 'Cena') returning id", [h1])).id;
    const added = await one<{ n: number }>(bruno, "select baptista.add_recipe_to_meal($1, $2) as n", [recipe, meal]);
    assert.equal(added.n, 3);
    const again = await one<{ n: number }>(bruno, "select baptista.add_recipe_to_meal($1, $2) as n", [recipe, meal]);
    assert.equal(again.n, 0);
    const items = await as(db, bruno, (q) =>
      q<{ name: string; grams: string }>("select f.name, i.grams from baptista.meal_items i join baptista.foods f on f.id = i.food_id where i.meal_id = $1 order by i.position", [meal]),
    );
    assert.deepEqual(items.map((i) => [i.name, Number(i.grams)]), [["Spaghetti", 200], ["Aglio", 0], ["Olio extravergine", 0]]);
    await rejects(as(db, bruno, (q) => q("insert into baptista.meal_items (household_id, meal_id, food_id, grams) values ($1, $2, $3, -1)", [h1, meal, pasta])), /check constraint/);
    await rejects(as(db, carla, (q) => q("select baptista.add_recipe_to_meal($1, $2)", [recipe, meal])), /not_found/);
    assert.equal(Number((await one<{ g: string }>("admin", "select baptista.recipe_grams(1.5, 'kg') as g")).g), 1500);
  });
});
