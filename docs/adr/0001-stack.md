# ADR 0001 — Web stack for App Register

**Status:** Accepted (Persistence superseded by [ADR 0002](0002-postgres.md))  
**Date:** 2026-11-21  
**Context:** Greenfield product; React 19+ required by Astryx; need a simple, cheap-to-run stack for a lean IT SaaS.

## Decision

| Layer | Choice | Pin / note |
| --- | --- | --- |
| UI framework | React 19 | Peer of Astryx |
| App framework | Next.js (App Router) | Matches Astryx’s official example; SSR + API routes in one deploy |
| Design system | Meta Astryx (`@astryxdesign/core`) + `@astryxdesign/theme-neutral` + `@stylexjs/stylex` | **Pinned** exact versions; beta |
| Language | TypeScript | Strict |
| Persistence | ~~SQLite via Drizzle ORM~~ → **Postgres via Drizzle ORM** | Superseded by [ADR 0002](0002-postgres.md) |
| Tests | Vitest (unit) | Fast, local, no network |
| Lint / types | ESLint + `tsc --noEmit` | Fed by Dev-Agent-Skills `gate.sh` |
| Email (later issues) | Provider behind a thin interface; start with a test sink | Email-first alerts per MVP |

## Why this stack

- **Astryx forces React 19+.** Next.js App Router is the documented simplest consumer path (prebuilt CSS, no StyleX compiler required until we author our own StyleX).
- **One process to run.** Next.js plus one Postgres keeps hosting cost low for early customers and for our own UAT (originally SQLite; see ADR 0002).
- **Cheap to operate.** No Kubernetes, no separate API fleet, no mandatory managed Postgres for v1.
- **Escape hatches.** Drizzle can move to Postgres without rewriting domain code; Astryx CLI (`theme add`, `component`) stays the API source of truth.

## Beta risk — Astryx

Astryx is in **beta**. Risks:

1. **Breaking API / CSS layer changes** between minors.
2. **Docs and CLI drift** (component props change; agent cheat sheets update via `npx @astryxdesign/cli init`).
3. **Incomplete components** for forms/tables we may need; we may compose primitives or wait for releases.

**Mitigations:** pin exact versions in `package.json` (no `^` on `@astryxdesign/*`); upgrade deliberately with `npx @astryxdesign/cli upgrade`; use `npx @astryxdesign/cli component <Name>` instead of guessing props; keep custom layout thin so a theme or core bump is mechanical.

## Alternatives considered

| Option | Rejected because |
| --- | --- |
| Vite SPA + separate API | Two deploys, more ops for a CRUD register |
| Remix / other React meta-frameworks | Weaker first-party Astryx examples |
| Tailwind-first UI | Product requires Astryx for all UI |
| Managed Postgres from day one | Unnecessary cost before multi-tenant scale |

## Consequences

- Issue `[01]` scaffolds Next.js + pinned Astryx + CI gate.
- Domain work stays in `src/lib/` services with UI last (Dev-Agent-Skills `implement-feature`).
- StyleX compiler is optional until we swizzle or author StyleX; `@stylexjs/stylex` is installed as required by Astryx.
