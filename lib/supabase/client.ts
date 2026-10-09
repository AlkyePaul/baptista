"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicEnv } from "@/lib/config/env";
import { BAPTISTA_SCHEMA } from "@/lib/supabase/schema";

/**
 * Browser Supabase client bound to the `baptista` schema.
 *
 * The browser session is never proof of identity: authorization is always
 * re-verified on the server and in the database (RLS).
 */
export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = requirePublicEnv();
  return createBrowserClient(supabaseUrl, supabasePublishableKey, {
    db: { schema: BAPTISTA_SCHEMA },
  });
}
