# Environments

Variable **names** only, never values.

| | UAT | PROD |
| --- | --- | --- |
| URL | TBD (preview / single VM) | TBD |
| Hosting | Single Node process (Next.js) | Same shape; human-promoted |
| Auth | API: bearer API keys (hashed in `api_keys`, one workspace per key). User sign-in TBD | Same |
| Database | Postgres 18 via `DATABASE_URL` | Postgres 18 via `DATABASE_URL` |
| Other services | Email sink / provider via `EMAIL_*` | Real email provider |
| Who deploys | Agent may deploy via CI to UAT | Human only |

## Environment variables

| Name | What it is for | Where it is set |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection URL (`postgres://user:password@host:5432/db`) | Host env / secrets; local value in `.env.example` matches `docker-compose.yml` |
| `EMAIL_FROM` | From-address for notice alerts | Host env / secrets |
| `EMAIL_PROVIDER` | `sink` (tests) or provider id | Host env |
| `APP_URL` | Public base URL for links in email | Host env |

Copy names into `.env.example` when the skeleton lands. Never commit `.env` files.

## Local and test databases

| Where | Database | How |
| --- | --- | --- |
| Local dev | Postgres 18 in Docker | `npm run db:up`, then `npm run db:migrate` |
| Unit tests | PGlite (in-process, in-memory) | Nothing to start; each test builds a fresh DB from `drizzle/` |
| CI | `postgres:18` service container | `npm run db:migrate` runs twice to prove migrations apply and are idempotent |

## API keys

Not environment variables: keys live hashed in the database. Create one per client and environment with `npm run api-key:create -- "<name>"` (against that environment's `DATABASE_URL`). Store the printed key in the client's secret store, never in the repo. Revoke with `npm run api-key:revoke -- <prefix>`.

## Deploy flow

PR merged to `main` → CI gate green → human deploys/promotes UAT → human promotes PROD.

## Test accounts (UAT)

Documented in the README once auth exists. Passwords never live in the repo.
