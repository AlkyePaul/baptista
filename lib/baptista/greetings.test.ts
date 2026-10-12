import { strict as assert } from "node:assert";
import { test } from "node:test";
import { describeWeather, dressAdvice, financeGreeting, kitchenGreeting, wardrobeGreeting } from "./greetings";

test("wardrobe greeting: weather, temperatures and what to wear; cautious without weather", () => {
  const g = wardrobeGreeting({ place: "Milano", source: "ip", temperature: 9.6, min: 6, max: 14, code: 61, rainChance: 80 });
  assert.match(g.text, /^Il meteo a Milano è pioggia: ora 10°, oggi tra 6° e 14°\. Puoi vestirti con un giaccone/);
  assert.match(g.text, /ombrello/);
  assert.equal(describeWeather(0), "sereno");
  assert.match(dressAdvice({ place: null, source: "device", temperature: 28, min: 22, max: 31, code: 0, rainChance: 0 }), /^abiti leggeri/);
  assert.match(dressAdvice({ place: null, source: "device", temperature: 15, min: 6, max: 20, code: 1, rainChance: 0 }), /a strati/);
  assert.match(wardrobeGreeting(null).text, /meteo/);
  assert.match(wardrobeGreeting({ place: null, source: "device", temperature: 20, min: 15, max: 22, code: 0, rainChance: 0 }).text, /^Il meteo dove ti trovi è sereno/);
});

test("kitchen greeting: nothing, under 500 kcal, no target, against the target", () => {
  assert.match(kitchenGreeting(0, 0, 2000).text, /non hai ancora segnato nessun pasto/);
  assert.match(kitchenGreeting(1, 320, 2000).text, /^Hai segnato 1 pasto oggi, per un totale di 320 kcal\. È ancora poco/);
  assert.match(kitchenGreeting(2, 900, null).text, /Imposta un obiettivo/);
  assert.match(kitchenGreeting(2, 900, 2000).text, /Sei al 45% del tuo obiettivo: restano 1\.100 kcal/);
  assert.match(kitchenGreeting(3, 1800, 2000).text, /vicino all'obiettivo/);
  const over = kitchenGreeting(4, 2300, 2000);
  assert.equal(over.expression, "alert");
  assert.match(over.text, /superato l'obiettivo di 300 kcal/);
});

test("finance greeting compares the month elapsed with the budget used", () => {
  assert.match(financeGreeting(0.4, 120, null, "EUR").text, /^Siamo al 40% del mese .* Imposta un budget totale/);
  assert.match(financeGreeting(0.5, 250, 500, "EUR").text, /hai usato il 50% del budget.*in linea/);
  assert.match(financeGreeting(0.3, 300, 500, "EUR").text, /più in fretta/);
  assert.match(financeGreeting(0.8, 100, 500, "EUR").text, /sotto il ritmo/);
  assert.match(financeGreeting(0.8, 600, 500, "EUR").text, /superato/);
});
