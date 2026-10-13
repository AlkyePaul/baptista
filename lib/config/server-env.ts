import "server-only";

/**
 * Server-only configuration names reserved for later phases.
 *
 * Nothing here is required in Phase 00: a missing AI configuration must never
 * break the build (docs/phases/PHASE_00_PROJECT_SETUP.md). Values are never
 * logged or returned to clients; only presence is reported.
 */
export const SERVER_ENV_NAMES = [
  // Auth: NextAuth session encryption and Supabase JWT minting.
  "AUTH_SECRET",
  "SUPABASE_JWT_SECRET",
  // Supabase service-role key (admin operations, e.g. user lookup at login).
  "SUPABASE_SECRET_KEY",
  // Phase 04+: AI routing (docs/architecture/AGENT.md).
  "AI_GATEWAY_API_KEY",
  "LOCAL_AI_BASE_URL",
  "LOCAL_AI_API_KEY",
  "LOCAL_AI_MODEL",
] as const;

export type ServerEnvName = (typeof SERVER_ENV_NAMES)[number];

export function serverEnvPresence(): Record<ServerEnvName, boolean> {
  return Object.fromEntries(
    SERVER_ENV_NAMES.map((name) => [name, Boolean(process.env[name]?.trim())]),
  ) as Record<ServerEnvName, boolean>;
}
