import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requirePublicEnv } from "@/lib/config/env";
import { BAPTISTA_SCHEMA } from "@/lib/supabase/schema";

/**
 * Server Supabase client for Server Components, Server Functions and Route
 * Handlers, bound to the `baptista` schema. Create one per request.
 *
 * Verify identity with `supabase.auth.getClaims()` (or `getUser()`), never
 * with the unverified session read from cookies.
 */
export async function createClient() {
  const { supabaseUrl, supabasePublishableKey } = requirePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    db: { schema: BAPTISTA_SCHEMA },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session and writes the cookies instead.
        }
      },
    },
  });
}
