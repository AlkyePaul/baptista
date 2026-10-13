import { strict as assert } from "node:assert";
import { test } from "node:test";
import { findBounds } from "./image-normalize";

test("findBounds: all-transparent returns null", () => {
  const data = new Uint8ClampedArray(4 * 4 * 4); // 4x4 image, all zeros (transparent)
  assert.equal(findBounds(data, 4, 4), null);
});

test("findBounds: single opaque pixel", () => {
  const w = 4;
  const h = 4;
  const data = new Uint8ClampedArray(w * h * 4);
  // Set pixel (2, 1) to opaque
  const idx = (1 * w + 2) * 4;
  data[idx] = 255;
  data[idx + 1] = 0;
  data[idx + 2] = 0;
  data[idx + 3] = 255;
  const bounds = findBounds(data, w, h);
  assert.deepEqual(bounds, { top: 1, left: 2, bottom: 1, right: 2 });
});

test("findBounds: top-left corner pixel", () => {
  const w = 3;
  const h = 3;
  const data = new Uint8ClampedArray(w * h * 4);
  data[3] = 128; // pixel (0,0) alpha = 128
  const bounds = findBounds(data, w, h);
  assert.deepEqual(bounds, { top: 0, left: 0, bottom: 0, right: 0 });
});

test("findBounds: bottom-right corner pixel", () => {
  const w = 5;
  const h = 5;
  const data = new Uint8ClampedArray(w * h * 4);
  const idx = (4 * w + 4) * 4;
  data[idx + 3] = 1; // alpha = 1
  const bounds = findBounds(data, w, h);
  assert.deepEqual(bounds, { top: 4, left: 4, bottom: 4, right: 4 });
});

test("findBounds: multiple pixels spanning a rectangle", () => {
  const w = 10;
  const h = 10;
  const data = new Uint8ClampedArray(w * h * 4);
  // Set pixel (2, 3) and (7, 8)
  data[(3 * w + 2) * 4 + 3] = 255;
  data[(8 * w + 7) * 4 + 3] = 255;
  const bounds = findBounds(data, w, h);
  assert.deepEqual(bounds, { top: 3, left: 2, bottom: 8, right: 7 });
});

test("findBounds: alpha = 0 is treated as transparent", () => {
  const w = 2;
  const h = 2;
  const data = new Uint8ClampedArray(w * h * 4);
  // RGB set but alpha = 0 → transparent
  data[0] = 255;
  data[1] = 255;
  data[2] = 255;
  data[3] = 0;
  assert.equal(findBounds(data, w, h), null);
});
