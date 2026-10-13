import "server-only";

import { DomainError } from "@/lib/errors";
import { toFoodFacts, type FoodFacts } from "@/lib/openfoodfacts-parse";

export type { FoodFacts };

/**
 * Open Food Facts lookup (Cucina, D25): nutrition data by barcode or by name.
 * Only the typed query leaves the server; the host is fixed (no user-provided URL, no SSRF),
 * the response is validated and out-of-range values are dropped. This is a data lookup, not an
 * AI provider: `local_only` does not apply, but the UI says the query goes to Open Food Facts.
 */

const BASE = "https://world.openfoodfacts.org";
const SEARCH_BASE = "https://search.openfoodfacts.org";
const TIMEOUT_MS = 8_000;
const FIELDS = "code,product_name,product_name_it,brands,nutriments,categories_tags";
const USER_AGENT = "Baptista/0.1 (prototipo domestico)";

async function getJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new DomainError("lookup_unavailable");
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new DomainError("lookup_unavailable");
  try {
    return await response.json();
  } catch {
    throw new DomainError("lookup_unavailable");
  }
}

export async function lookupBarcode(barcode: string): Promise<FoodFacts[]> {
  const data = (await getJson(`${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`)) as
    | { status?: number; product?: unknown }
    | null;
  if (!data || data.status !== 1) return [];
  const facts = toFoodFacts({ code: barcode, ...(data.product as object) });
  return facts ? [facts] : [];
}

export async function searchByName(query: string, limit = 8): Promise<FoodFacts[]> {
  const params = new URLSearchParams({
    q: query,
    page_size: String(limit * 2),
    fields: FIELDS,
  });
  const data = (await getJson(`${SEARCH_BASE}/search?${params}`)) as { hits?: unknown[] } | null;
  const results = (Array.isArray(data?.hits) ? data.hits : [])
    .map(toFoodFacts)
    .filter((f): f is FoodFacts => f !== null && f.kcal_100g !== null);
  return results.slice(0, limit);
}
