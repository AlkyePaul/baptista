/**
 * Public configuration (safe to ship to the browser).
 *
 * Only the Supabase URL and publishable key may be NEXT_PUBLIC (see
 * docs/architecture/SECURITY.md). `process.env.NEXT_PUBLIC_*` must be
 * referenced literally so Next.js can inline the values at build time.
 */

export type PublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type PublicEnvResult =
  | { ok: true; env: PublicEnv }
  | { ok: false; missing: string[]; invalid: string[] };

export function readPublicEnv(): PublicEnvResult {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  const missing: string[] = [];
  const invalid: string[] = [];

  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  else if (!isHttpUrl(supabaseUrl)) invalid.push("NEXT_PUBLIC_SUPABASE_URL");

  if (!supabasePublishableKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  } else if (isSecretKey(supabasePublishableKey)) {
    // A secret key in a NEXT_PUBLIC variable would be shipped to every browser.
    invalid.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (missing.length || invalid.length) return { ok: false, missing, invalid };
  return { ok: true, env: { supabaseUrl, supabasePublishableKey } };
}

export class ConfigError extends Error {
  readonly missing: string[];
  readonly invalid: string[];

  constructor(missing: string[], invalid: string[]) {
    // Names only, never values.
    super(
      `Baptista configuration error. Missing: [${missing.join(", ")}]. Invalid: [${invalid.join(", ")}].`,
    );
    this.name = "ConfigError";
    this.missing = missing;
    this.invalid = invalid;
  }
}

export function requirePublicEnv(): PublicEnv {
  const result = readPublicEnv();
  if (!result.ok) throw new ConfigError(result.missing, result.invalid);
  return result.env;
}

/** Rejects `sb_secret_…` keys and legacy JWT keys whose role is service_role. */
function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)).role === "service_role";
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
