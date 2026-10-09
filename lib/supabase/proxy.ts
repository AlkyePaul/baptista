import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readPublicEnv } from "@/lib/config/env";

/**
 * Refreshes the Supabase Auth session cookies on each matched request.
 *
 * This is session plumbing only: it performs no authorization and no
 * redirects. Route protection is introduced with Auth in Phase 02.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const config = readPublicEnv();
  // Missing configuration is reported by the app itself; never block here.
  if (!config.ok) return response;

  const { supabaseUrl, supabasePublishableKey } = config.env;

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Cache-control headers that keep refreshed tokens out of shared caches.
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Do not run code between client creation and this call: it triggers the
  // token refresh. getClaims() validates the JWT.
  await supabase.auth.getClaims();

  return response;
}
