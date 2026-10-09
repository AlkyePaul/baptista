<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Baptista project rules

- Read `docs/BAPTISTA_MASTER_SPEC.md`, `docs/BAPTISTA_PRODUCTION_PLAN.md`, `docs/BAPTISTA_STATUS.md` and only the current phase file before working. Implement one phase per session and stop at its handoff.
- Keep `docs/BAPTISTA_STATUS.md` coherent with the work: update it with verified outcomes at the end of every significant session.
- **Product language is Italian**: every user-visible string (UI, errors, detector texts, future AI replies) is in Italian, it-IT formats, `lang="it"`. Code, identifiers and comments stay in English.
- TypeScript strict, Tailwind CSS 4, Next.js App Router. Server modules import `server-only`; Supabase clients come from `lib/supabase/*` and are bound to the `baptista` schema.
- Never touch `public` (GuideApp) or run remote migrations without the review in `supabase/README.md`.
- Mutations go through Server Actions in `app/actions/*` → `services/*` (server-only) with zod validation and `version` checks; never trust ids/household from the client.
- Checks: `npm run check` (lint + typecheck + build) and `npm test` (PGlite DB tests + unit tests). New migrations must pass `npm run test:db` before any remote apply.
