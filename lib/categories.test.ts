import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CATEGORY_COLORS, HEX_COLOR, recordColor, ringColor, RING_COLORS } from "./categories";

test("a record takes its category colour, otherwise a stable fallback", () => {
  assert.equal(recordColor({ id: "h1", category: { id: "c", name: "Sport", color: "#3f9d8c" } }), "#3f9d8c");
  assert.equal(recordColor({ id: "h1", category: null }), ringColor("h1"));
  assert.equal(ringColor("h1"), ringColor("h1"));
  assert.ok((RING_COLORS as readonly string[]).includes(ringColor("anything")));
});

test("palette colours are valid lowercase hex (as the DB check requires)", () => {
  for (const c of CATEGORY_COLORS) {
    assert.match(c, HEX_COLOR);
    assert.equal(c, c.toLowerCase());
  }
});
