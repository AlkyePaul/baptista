import { strict as assert } from "node:assert";
import { test } from "node:test";
import { lookItemSchema } from "./looks";

test("lookItemSchema: valid placement passes", () => {
  const result = lookItemSchema.safeParse({
    wardrobe_item_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    x: 0.5,
    y: 0.3,
    scale: 1.0,
    rotation: 0,
    z_order: 0,
  });
  assert.ok(result.success);
});

test("lookItemSchema: coordinates at boundaries pass", () => {
  assert.ok(lookItemSchema.safeParse({ wardrobe_item_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", x: 0, y: 0, scale: 0.1, rotation: -360, z_order: 0 }).success);
  assert.ok(lookItemSchema.safeParse({ wardrobe_item_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", x: 1, y: 1, scale: 3.0, rotation: 360, z_order: 99 }).success);
});

test("lookItemSchema: x out of range rejected", () => {
  const result = lookItemSchema.safeParse({
    wardrobe_item_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    x: 1.5,
    y: 0.5,
    scale: 1.0,
    rotation: 0,
    z_order: 0,
  });
  assert.ok(!result.success);
});

test("lookItemSchema: y out of range rejected", () => {
  const result = lookItemSchema.safeParse({
    wardrobe_item_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    x: 0.5,
    y: -0.1,
    scale: 1.0,
    rotation: 0,
    z_order: 0,
  });
  assert.ok(!result.success);
});

test("lookItemSchema: scale too small rejected", () => {
  const result = lookItemSchema.safeParse({
    wardrobe_item_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    x: 0.5,
    y: 0.5,
    scale: 0.05,
    rotation: 0,
    z_order: 0,
  });
  assert.ok(!result.success);
});

test("lookItemSchema: scale too large rejected", () => {
  const result = lookItemSchema.safeParse({
    wardrobe_item_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    x: 0.5,
    y: 0.5,
    scale: 3.5,
    rotation: 0,
    z_order: 0,
  });
  assert.ok(!result.success);
});

test("lookItemSchema: rotation out of range rejected", () => {
  assert.ok(!lookItemSchema.safeParse({
    wardrobe_item_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    x: 0.5,
    y: 0.5,
    scale: 1.0,
    rotation: 400,
    z_order: 0,
  }).success);
  assert.ok(!lookItemSchema.safeParse({
    wardrobe_item_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    x: 0.5,
    y: 0.5,
    scale: 1.0,
    rotation: -361,
    z_order: 0,
  }).success);
});

test("lookItemSchema: invalid UUID rejected", () => {
  const result = lookItemSchema.safeParse({
    wardrobe_item_id: "not-a-uuid",
    x: 0.5,
    y: 0.5,
    scale: 1.0,
    rotation: 0,
    z_order: 0,
  });
  assert.ok(!result.success);
});

test("lookItemSchema: string numbers are coerced", () => {
  const result = lookItemSchema.safeParse({
    wardrobe_item_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    x: "0.5",
    y: "0.3",
    scale: "1.5",
    rotation: "45",
    z_order: "2",
  });
  assert.ok(result.success);
  if (result.success) {
    assert.equal(result.data.x, 0.5);
    assert.equal(result.data.scale, 1.5);
    assert.equal(result.data.z_order, 2);
  }
});
