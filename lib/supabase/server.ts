import "server-only";

import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { requirePublicEnv } from "@/lib/config/env";
import { BAPTISTA_SCHEMA } from "@/lib/supabase/schema";

/**
 * Mint a short-lived JWT for PostgREST. `auth.uid()` returns `sub`, so all
 * existing RLS policies, triggers and RPCs continue working unchanged.
 */
async function mintJwt(userId: string): Promise<string> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("SUPABASE_JWT_SECRET is not set");
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub: userId, role: "authenticated", aud: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

/**
 * Authenticated Supabase client for a known user. The minted JWT makes
 * `auth.uid()` return `userId`, so PostgREST/RLS work transparently.
 * No cookies involved — pure stateless per-request client.
 */
export async function createAuthenticatedClient(userId: string) {
  const { supabaseUrl, supabasePublishableKey } = requirePublicEnv();
  const jwt = await mintJwt(userId);
  return createClient(supabaseUrl, supabasePublishableKey, {
    db: { schema: BAPTISTA_SCHEMA },
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  });
}

/**
 * Service-role client for admin operations (e.g. looking up users at login).
 * Only used in the NextAuth `authorize()` callback.
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  }
  return createClient(supabaseUrl, supabaseSecretKey, {
    db: { schema: BAPTISTA_SCHEMA },
  });
}
