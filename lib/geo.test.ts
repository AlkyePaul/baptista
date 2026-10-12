import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatGeoCookie, parseGeoCookie, validCoordinates } from "./geo";

test("device position is rounded to ~1 km and the cookie round-trips; invalid values are rejected", () => {
  const c = validCoordinates(45.46427, 9.18951)!;
  assert.deepEqual(c, { latitude: 45.46, longitude: 9.19 });
  assert.equal(formatGeoCookie(c), "45.46,9.19");
  assert.deepEqual(parseGeoCookie("45.46,9.19"), c);
  assert.deepEqual(parseGeoCookie("-33.87,151.21"), { latitude: -33.87, longitude: 151.21 });
  assert.equal(validCoordinates(91, 0), null);
  assert.equal(validCoordinates(Number.NaN, 0), null);
  assert.equal(validCoordinates("45", 9), null);
  assert.equal(parseGeoCookie("95.00,9.19"), null);
  assert.equal(parseGeoCookie("abc"), null);
  assert.equal(parseGeoCookie(undefined), null);
});
