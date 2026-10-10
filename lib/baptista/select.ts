/**
 * Deterministic choice among complete alternative sentences (B-2): a stable hash of
 * (observation, day) so every device shows the same sentence, and nothing is random.
 */

/** FNV-1a 32-bit. */
export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function pick<T>(alternatives: readonly T[], seed: string): { value: T; index: number } {
  if (!alternatives.length) throw new Error("pick: no alternatives");
  const index = stableHash(seed) % alternatives.length;
  return { value: alternatives[index], index };
}

/** Days since 1970-01-01 for a civil date (no timezone involved: the date is already local). */
export function dayNumber(civilDate: string): number {
  const [y, m, d] = civilDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}
