import { NextResponse, type NextRequest } from "next/server";

/**
 * No-op proxy: Supabase session refresh is no longer needed (NextAuth manages
 * its own session cookie via the route handler). Route protection is handled
 * by `requireUser()` in server components and actions.
 */
export function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)",
  ],
};
