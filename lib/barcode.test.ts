import { strict as assert } from "node:assert";
import { test } from "node:test";
import { acceptReading, hasValidCheckDigit } from "./barcode";

test("GS1 check digit for EAN-13, EAN-8 and UPC-A", () => {
  assert.equal(hasValidCheckDigit("8001505005707"), true); // EAN-13
  assert.equal(hasValidCheckDigit("8001505005708"), false);
  assert.equal(hasValidCheckDigit("96385074"), true); // EAN-8
  assert.equal(hasValidCheckDigit("036000291452"), true); // UPC-A
  assert.equal(hasValidCheckDigit("12345"), false);
  assert.equal(hasValidCheckDigit("80015050057a7"), false);
});

test("only product formats with a plausible code are accepted", () => {
  assert.equal(acceptReading("ean_13", " 8001505005707 "), "8001505005707");
  assert.equal(acceptReading("ean_13", "8001505005708"), null);
  assert.equal(acceptReading("upc_e", "01234565"), "01234565");
  assert.equal(acceptReading("qr_code", "8001505005707"), null);
});
