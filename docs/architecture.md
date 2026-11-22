# Architecture

## What the app does

App Register is a flat-priced register of the SaaS a company buys and the apps its staff build in-house. Lean IT teams (1–5 people) keep named owners, backup owners, renewal dates, notice deadlines, attachments, and a light quarterly review — without enterprise discovery or analytics.

## How a request flows

Browser → Next.js App Router (`src/app/`) → server actions or route handlers → domain services (`src/lib/services/`) → Drizzle (`src/lib/db/`) → Postgres 18.

JSON API: route handlers in `src/app/api/` (shapes in [api.md](api.md)). Each handler resolves the workspace with `getCurrentWorkspaceId()` and only touches rows in it.

UI uses Meta Astryx components only. Business rules live in services, not in React components.

## Where each kind of code lives

| Kind | Folder | Example to copy |
| --- | --- | --- |
| Page / route | `src/app/` | `src/app/page.tsx` |
| Astryx providers | `src/app/providers.tsx` | same |
| Domain services | `src/lib/services/` | `src/lib/services/apps.ts` |
| JSON API route | `src/app/api/<resource>/route.ts` | `src/app/api/apps/route.ts` |
| Constants / enums | `src/lib/constants.ts` | same |
| DB schema + client | `src/lib/db/` | `src/lib/db/schema.ts` |
| Migrations | `drizzle/` (generated), `drizzle/rollback/` (hand-written) | `drizzle/0000_init.sql` |
| Unit tests | next to code as `*.test.ts` | `src/lib/**/*.test.ts` |
| Product docs | `docs/product/`, `docs/adr/` | `docs/product/brief.md` |
| Research | `docs/research/` | validation markdown (unchanged) |

## Rules that are not obvious from the code

- Prefer `npx @astryxdesign/cli component <Name>` (or the `astryx` npm script) over guessing Astryx props.
- Pin `@astryxdesign/*` versions; see [ADR 0001](adr/0001-stack.md).
- Seed and demo data must be fictional — never real company, client, or employer data.
- No magic strings for statuses, kinds, routes, or alert offsets: put them in `src/lib/constants.ts`.
- Every table except `workspaces` carries `workspace_id`; children reference parents by `(id, workspace_id)` so a row can never point into another workspace. One default workspace until sign-in exists.
- Allowed values are `text` plus a `CHECK` built from the arrays in `src/lib/constants.ts` (no Postgres `ENUM`).
- Ids come from `newId()` (`src/lib/db/ids.ts`), never a DB default. `updated_at` is set by Drizzle `$onUpdate`, so all writes go through services.
- Apps are soft-deleted (`archived_at`); active-app queries share one filter in `src/lib/services/apps.ts`.
- Schema change: edit `src/lib/db/schema.ts`, `npm run db:generate`, write the inverse in `drizzle/rollback/`, call it out in the PR.
- Unit tests use `createTestDb()` (`src/lib/db/test-db.ts`): a fresh in-memory PGlite built from the real migrations.
