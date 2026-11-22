# Architecture

## What the app does

App Register is a flat-priced register of the SaaS a company buys and the apps its staff build in-house. Lean IT teams (1–5 people) keep named owners, backup owners, renewal dates, notice deadlines, attachments, and a light quarterly review — without enterprise discovery or analytics.

## How a request flows

Browser → Next.js App Router (`src/app/`) → server actions or route handlers → domain services (`src/lib/services/`) → Drizzle repositories (`src/lib/db/`) → SQLite file.

UI uses Meta Astryx components only. Business rules live in services, not in React components.

## Where each kind of code lives

| Kind | Folder | Example to copy |
| --- | --- | --- |
| Page / route | `src/app/` | `src/app/page.tsx` |
| Astryx providers | `src/app/providers.tsx` | same |
| Domain services | `src/lib/services/` | (added with domain issues) |
| Constants / enums | `src/lib/constants.ts` | same |
| DB schema + client | `src/lib/db/` | (added with persistence) |
| Unit tests | next to code as `*.test.ts` | `src/lib/**/*.test.ts` |
| Product docs | `docs/product/`, `docs/adr/` | `docs/product/brief.md` |
| Research | `docs/research/` | validation markdown (unchanged) |

## Rules that are not obvious from the code

- Prefer `npx @astryxdesign/cli component <Name>` (or the `astryx` npm script) over guessing Astryx props.
- Pin `@astryxdesign/*` versions; see [ADR 0001](adr/0001-stack.md).
- Seed and demo data must be fictional — never real company, client, or employer data.
- No magic strings for statuses, kinds, routes, or alert offsets: put them in `src/lib/constants.ts`.
