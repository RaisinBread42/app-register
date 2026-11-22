# Architecture

## What the app does

App Register is a flat-priced register of the SaaS a company buys and the apps its staff build in-house. Lean IT teams (1–5 people) keep named owners, backup owners, renewal dates, notice deadlines, attachments, and a light quarterly review — without enterprise discovery or analytics.

## How a request flows

Browser → Next.js App Router (`src/app/`) → server actions or route handlers → domain services (`src/lib/services/`) → Drizzle (`src/lib/db/`) → Postgres 18.

JSON API: route handlers in `src/app/api/` ([api.md](api.md); OpenAPI spec in `src/lib/api/openapi.ts`). Every handler goes through `handle()` in `src/lib/api/http.ts`: bearer API key → workspace, `Idempotency-Key` on POST/PATCH, errors → `{ error }`. Services only touch rows in that workspace.

UI (`src/app/(register)/`): server components load data and server actions submit it, both through `src/lib/ui/api-client.ts`, which calls `${APP_URL}/api/*` over HTTP with `APP_REGISTER_API_KEY`. Client components never call the API and never see the key. Each POST/PATCH sends an `Idempotency-Key` that the page rendered for that user action, so a double-click or retry of one Save is one write. `src/proxy.ts` puts every non-API route behind HTTP Basic auth with `UI_PASSWORD` (fails closed when unset); `/api/*` keeps its bearer keys.

Hosting monitoring: `src/lib/hosting-catalog.ts` lists the providers and services the add-hosting dialog offers and how each is watched. `src/lib/services/hosting-monitor.ts` (the hosting check) reads only free, keyless public sources through one small module, `src/lib/monitoring/http.ts` (8 s timeout, `User-Agent: app-register`, each URL once per run, four at a time): endoflife.date for end-of-support dates, Statuspage `summary.json` for Vercel, Cloudflare, Netlify and GitHub, Google Cloud's `incidents.json`, AWS Health's `public/currentevents`, and the Azure status RSS feed. `src/lib/services/hosting-health.ts` turns what the check stored into point deductions and the Hosting status pill. Limits: public status pages only show incidents the provider chooses to publish, never account-specific ones (Azure Service Health and the AWS Health API need the customer's own cloud credentials and are not used); Azure's feed is prose with no severity or service list, so matching is by service and region names in the text; a row typed as free text is not monitored; and the check runs on save, on demand and when a scheduler calls `POST /api/monitoring/hosting/refresh`, not continuously.

UI uses Meta Astryx components only (Obsidian theme in `src/themes/obsidian/`, edited with the theme editor in `themes/obsidian/`). Screens mirror `docs/design/app-register-prototype.html`; parts with no API yet (health scores, dependency, licence and pricing checks, sources) show a muted coming-soon state, never made-up numbers. Business rules live in services, not in React components.

## Where each kind of code lives

| Kind | Folder | Example to copy |
| --- | --- | --- |
| Page / route | `src/app/(register)/<route>/page.tsx` (server: loads via the API client) + a client view beside it | `src/app/(register)/applications/page.tsx` |
| UI server action | `src/app/(register)/actions.ts` | `createAppAction` |
| UI → API client | `src/lib/ui/api-client.ts` (types mirror the OpenAPI schemas) | same |
| Astryx providers | `src/app/providers.tsx` | same |
| Domain services | `src/lib/services/` | `src/lib/services/apps.ts` |
| Outside feeds (fetch + parsing) | `src/lib/monitoring/` (tests inject a fake `fetchText`; `src/test-setup.ts` blocks the real one) | `src/lib/monitoring/status-feeds.ts` |
| JSON API route | `src/app/api/<resource>/route.ts` (and add it to `src/lib/api/openapi.ts` and `ROUTES` in `src/lib/api/test/client.ts`, or the tests fail) | `src/app/api/apps/route.ts` |
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
