import "server-only";

import { readPublicEnv } from "@/lib/config/env";

export type SupabaseHealth =
  | { status: "unconfigured"; missing: string[]; invalid: string[] }
  | { status: "ok"; latencyMs: number }
  | { status: "error"; httpStatus: number | null; reason: string };

/**
 * Non-destructive connectivity check against the Auth health endpoint using
 * the publishable key. It reads no tables and creates nothing, so it is safe
 * against the Supabase project shared with GuideApp.
 */
export async function checkSupabaseHealth(timeoutMs = 5000): Promise<SupabaseHealth> {
  const config = readPublicEnv();
  if (!config.ok) {
    return { status: "unconfigured", missing: config.missing, invalid: config.invalid };
  }

  const { supabaseUrl, supabasePublishableKey } = config.env;
  const started = Date.now();

  try {
    const res = await fetch(new URL("/auth/v1/health", supabaseUrl), {
      headers: { apikey: supabasePublishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return { status: "error", httpStatus: res.status, reason: "unexpected_status" };
    }
    return { status: "ok", latencyMs: Date.now() - started };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError" ? "timeout" : "unreachable";
    // Never log URLs or keys.
    return { status: "error", httpStatus: null, reason };
  }
}
