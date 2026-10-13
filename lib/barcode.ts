/** Product barcodes read by the camera (Cucina): EAN-13, EAN-8, UPC-A and UPC-E. */

export const PRODUCT_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

/** GS1 check digit (EAN-8, UPC-A as 12 digits, EAN-13, GTIN-14). */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^(?:\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Accepts a reading only if it can be a product code. UPC-E carries a check digit computed on
 * its expanded form, so it is only checked for shape; the scanner also wants two equal reads.
 */
export function acceptReading(format: string, rawValue: string): string | null {
  const code = rawValue.trim();
  if (format === "upc_e") return /^\d{6,8}$/.test(code) ? code : null;
  if (!(PRODUCT_FORMATS as readonly string[]).includes(format)) return null;
  return hasValidCheckDigit(code) ? code : null;
}
