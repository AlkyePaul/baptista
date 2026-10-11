import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Isolated database for migration tests: PGlite (Postgres in WASM) with a minimal shim of the
 * Supabase roles and `auth` schema. Every Baptista migration is applied from scratch, then tests
 * run under the real `anon` / `authenticated` roles with JWT claims, never only as superuser.
 */

const SHIM = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Minimal Supabase Storage: buckets, objects with RLS (no policies = no access) and foldername().
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant all on storage.objects, storage.buckets to service_role;
`;

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

export type Db = PGlite;

export async function createDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(SHIM);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

export type Actor = { id: string; email: string } | "anon" | "admin";

/** Run statements as a role inside one transaction; always rolled back unless `commit`. */
export async function as<T>(
  db: Db,
  actor: Actor,
  fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
  { commit = true }: { commit?: boolean } = {},
): Promise<T> {
  await db.exec("begin");
  try {
    if (actor === "anon") {
      await db.exec("set local role anon");
    } else if (actor !== "admin") {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: actor.id, role: "authenticated" }),
      ]);
      await db.exec("set local role authenticated");
    }
    const result = await fn(async (sql, params) => (await db.query(sql, params)).rows as never);
    await db.exec(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

let counter = 0;
export async function createUser(db: Db, name: string, withProfile = true) {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  const user = { id, email: `${name.toLowerCase()}@test.local` };
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, user.email]);
  if (withProfile) {
    // Profiles are provisioned only by claim_invitation; seed them directly as admin.
    await db.query("insert into baptista.profiles (user_id, display_name) values ($1, $2)", [id, name]);
  }
  return user;
}

/** Assert that a promise rejects with a message matching `pattern`. */
export async function rejects(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (error) {
    const message = (error as Error).message;
    if (!pattern.test(message)) {
      throw new Error(`Expected error ${pattern}, got: ${message}`);
    }
    return;
  }
  throw new Error(`Expected rejection matching ${pattern}, but it resolved`);
}
