# Supabase — Baptista conventions

Contracts: [DATABASE](../docs/architecture/DATABASE.md), [SECURITY](../docs/architecture/SECURITY.md). This file is the operational procedure; it does not authorize remote changes.

## Shared project

Baptista temporarily shares the Supabase project **GuideApp-supabase** (`kkaujiuedobfjnmhlbiy`, eu-central-1, Postgres 17). `public`, `mosquitos` and `7sapp` belong to other apps. Every Baptista object lives in `baptista.*`; only the named infrastructure exceptions (Auth, `storage.objects` policies for Baptista buckets, extensions) are touched, and only additively.

The remote migration history is shared with GuideApp (45 GuideApp migrations before Baptista; first Baptista migration `20261009164314_baptista_create_schema`). This repo only contains Baptista migrations, so the local folder is intentionally a *subset* of the remote history. **Never** run `supabase db reset`, `supabase db push` or `supabase migration repair` against the remote project from this repo without the review below. This repo is **not** linked (`supabase link`) to the remote.

Remote migrations applied through the Supabase MCP/Dashboard get their version from the server: after applying, rename the local file to that exact `<version>_<name>.sql` so local and remote IDs match.

### Applied migrations

`20261009164314_baptista_create_schema`, `20261009192058_baptista_foundations`, `20261009192227_baptista_core_domains`, `20261009212333_baptista_goal_direction`, `20261009212442_baptista_function_grants`, `20261009215527_baptista_categories`, `20261009224445_baptista_kitchen`, `20261009224541_baptista_finance`, `20261010202151_baptista_wardrobe`, `20261010202428_baptista_connections`, `20261010202448_baptista_presentation`, `20261012123725_baptista_food_catalog`, `20261012123825_baptista_invitations`, `20261012211108_baptista_app_users` (remote SQL equal to the files except some comment banners). The remote history also holds `20261011164801_baptista_food_catalog_part1`, a no-op (`select 1`) left by a tool test on 2026-10-12, with no local file. New functions inherit EXECUTE for PUBLIC: always revoke it (a DB test enforces that anon/public have nothing).

### Users (D33)

Who can use Baptista is the table `baptista.app_users` (email lowercase, display_name, household_id, role owner/member), edited by hand in the Dashboard Table Editor. Inserting/updating a row provisions the Auth account with that email (profile + active membership); deleting it revokes the membership. Data rows are not part of the migrations: the current rows (2 owners of «FAMILIADA») were inserted with SQL on 2026-10-12. Every procedure refuses accounts not in the table (`not_allowed`), so a new migration test user must be inserted there too (the PGlite harness does it in `createUser`).

### Schema `baptista` (created 2026-10-09)

- Owner `postgres`; `USAGE` for `authenticated` and `service_role` only; **no access for `anon`**; no default privileges. Every table gets explicit minimal grants + RLS in its own migration.
- The `mosquitos`/`7sapp` pattern (default `GRANT ALL` to `anon`) and the broad grants in Supabase's "Using Custom Schemas" guide are intentionally **not** used.
- Data API exposure is managed **only** in the Dashboard (Exposed schemas): it must list `public`, `graphql_public`, `mosquitos`, `baptista`. Do not set `pgrst.db_schemas` on the `authenticator` role (an old override caused the 2026-10-09 `mosquitos` incident, see STATUS). Locally, `config.toml` already exposes `baptista`.

## Migrations

- Create with the CLI (verified v2.120.0): `npx supabase migration new <snake_case_name>` → `supabase/migrations/<timestamp>_<name>.sql`.
- One concern per migration; schema-qualify every object (`baptista.households`), no `public` objects, no `ALTER DEFAULT PRIVILEGES` broad enough to expose future tables.
- RLS enabled and policies/grants written in the same migration that creates a table.
- Never edit a migration once applied anywhere shared; add a new one.

### Review checklist (before any remote apply)

1. Diff touches only `baptista.*` and the named infrastructure exceptions — no `public`, `mosquitos`, `7sapp` changes.
2. Applied and tested on an isolated database first (below), including negative RLS tests under real roles.
3. Remote history inventoried just before applying; timestamps do not collide.
4. Backup/recovery path noted; Data API exposure of `baptista` confirmed (Dashboard), never by removing GuideApp schemas.
5. Result recorded in `docs/BAPTISTA_STATUS.md` (migration IDs, commands, outcome).
6. **Order:** apply the migration to the remote *before* running/deploying app code that depends on it (on 2026-10-09 the app queried `categories` a few minutes before the table existed and every habits page failed with `DomainError: unknown`).

## Isolated environment

Default (no Docker needed): `npm run test:db` loads every migration into **PGlite** with a shim of the Supabase roles (`anon`, `authenticated`, `service_role`) and `auth.uid()` from JWT claims, then runs negative/positive tests under the real roles (`supabase/tests/`). It does not exercise PostgREST/GoTrue.

Full stack alternative: `npx supabase start` (requires Docker) using `supabase/config.toml`, then `npx supabase migration up` / `npx supabase db reset` **locally only**. Alternatively a Supabase branch of the shared project. Test users are created only there, never in the shared Auth.

## Storage buckets (reserved, created in their owning phase)

| Bucket | Visibility | Phase |
| --- | --- | --- |
| `baptista-receipts` | private | 04 |
| `baptista-wardrobe` | private, 10 MB, JPEG/PNG/WebP; policies `baptista_wardrobe_{insert,select,delete}` | 04 (migration `baptista_wardrobe`) |
| `baptista-avatars` | private | 02 |

Object path: `<household_uuid>/<owner_uuid>/<upload_uuid>/<server_generated_name>`. Policies on `storage.objects` are scoped by `bucket_id` and never alter existing policies (e.g. GuideApp's public `avatars` bucket). Constants live in `lib/supabase/schema.ts`.
