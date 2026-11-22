# App Register

Obsidian Software product: a flat-priced register of the SaaS a company buys and the apps its staff build in-house, for lean IT teams of 1–5 people.

> The renewal and ownership register for a one-to-five-person IT team: flat price, live in an afternoon from your spreadsheet, and no notice deadline missed because someone left.

## Docs

- [Product brief](docs/product/brief.md)
- [MVP scope](docs/product/mvp.md)
- [Stack ADR](docs/adr/0001-stack.md)
- [Architecture](docs/architecture.md)
- [Validation research](docs/research/saas-app-register-validation-2026-11-21.md)

## Stack

Next.js (App Router) · React 19 · Meta Astryx **0.7.17** (pinned) · TypeScript · Vitest. See [ADR 0001](docs/adr/0001-stack.md).

## Run locally

```bash
npm ci
npm run dev          # http://localhost:3000
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
