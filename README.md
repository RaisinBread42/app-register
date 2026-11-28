# App Register

Obsidian Software product: a flat-priced register of the SaaS a company buys and the apps its staff build in-house, for lean IT teams of 1–5 people.

> **Know what your applications depend on — and what needs attention.**
>
> Monitor app health, dependencies, software support, vendor notices, hosting changes, and renewal deadlines in one calm workspace.

App Register is an application health and lifecycle monitoring service for lean IT teams (1–5 people) in organisations of about 30–500 staff. It tracks bought SaaS and internally built apps, ties relevant changes to the apps they affect, and surfaces the next useful action ([spec v1.0](docs/product/spec-v1.md) §1.1).

## Docs

- [Spec v1.0 (source of truth)](docs/product/spec-v1.md) · [Governance Board addition](docs/product/governance-board.md) · [Gap analysis and decisions](docs/product/gap-analysis.md)
- [Product brief](docs/product/brief.md)
- [MVP scope](docs/product/mvp.md)
- [Stack ADR](docs/adr/0001-stack.md)
- [Postgres ADR](docs/adr/0002-postgres.md)
- [JSON API](docs/api.md)
- [Architecture](docs/architecture.md)
- [Validation research](docs/research/saas-app-register-validation-2026-11-21.md)

## Stack

Next.js (App Router) · React 19 · Meta Astryx **0.7.17** (pinned) · TypeScript · Vitest. See [ADR 0001](docs/adr/0001-stack.md).

## Run locally

```bash
npm ci
npm run dev          # http://localhost:3000
```

The UI needs `DATABASE_URL`, `APP_URL`, `APP_REGISTER_API_KEY` (from `npm run api-key:create -- "UI"`) and `UI_PASSWORD` in the environment ([docs/environments.md](docs/environments.md)). The browser asks for a password: any username, the `UI_PASSWORD` value. Without `UI_PASSWORD` set, every page answers 503.

## Database

Postgres 18 only ([ADR 0002](docs/adr/0002-postgres.md)). Copy `DATABASE_URL` from `.env.example`.

```bash
npm run db:up          # Postgres 18 in Docker (docker-compose.yml)
npm run db:migrate     # apply drizzle/ migrations and ensure the default workspace (safe to re-run)
npm run db:generate    # after editing src/lib/db/schema.ts: write a new migration
npm run db:down        # stop the container (data stays in the named volume)
```

Unit tests need no Docker: they run on PGlite.

## API

Every request needs `Authorization: Bearer <key>`; POST and PATCH also need an `Idempotency-Key`. Details: [docs/api.md](docs/api.md). Spec: `GET /api/openapi.json`.

```bash
npm run api-key:create -- "Front end"   # prints the key once
npm run api-key:revoke -- ar_AbC123     # by the prefix printed at creation
```

## Demo data and end-to-end checks

```bash
npm run db:seed      # fictional demo data into the default workspace (refuses a workspace with real apps)
DATABASE_URL=postgres://… npm run e2e          # migrate, seed, build, start, then Playwright
DATABASE_URL=postgres://… npm run e2e -- journeys   # one file
E2E_SKIP_BUILD=1 DATABASE_URL=postgres://… npm run e2e   # reuse the last build
```

`npm run e2e` runs the journeys in `e2e/`, an axe WCAG 2.2 A/AA audit and a no-sideways-scroll check on every primary screen, and saves screenshots at 360, 768 and 1280 px to `e2e-artifacts/screenshots/`. Point it at a throwaway database: local Docker or CI, never UAT. Outside sources are blocked in the app server during the run. CI runs it on every PR and uploads `e2e-artifacts/`.

## Checks

```bash
npm test             # Vitest
npm run lint
npm run typecheck
bash scripts/gate.sh # lint + typecheck + tests (CI uses this)
```

## Astryx

```bash
npm run astryx -- component Button   # look up props; do not guess
npx @astryxdesign/cli init           # refresh agent cheat sheet
```

## Development process

Follows [Dev-Agent-Skills](https://github.com/RaisinBread42/Dev-Agent-Skills): plan → tests → services → UI → gate → PR. One PR per MVP issue.
