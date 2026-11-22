# App Register

Obsidian Software product: a flat-priced register of the SaaS a company buys and the apps its staff build in-house, for lean IT teams of 1–5 people.

> The renewal and ownership register for a one-to-five-person IT team: flat price, live in an afternoon from your spreadsheet, and no notice deadline missed because someone left.

## Docs

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
