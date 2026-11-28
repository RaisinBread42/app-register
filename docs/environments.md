# Environments

Variable **names** only, never values.

| | UAT | PROD |
| --- | --- | --- |
| URL | TBD (preview / single VM) | TBD |
| Hosting | Single Node process (Next.js) | Same shape; human-promoted |
| Auth | API: bearer API keys (hashed in `api_keys`, one workspace per key). UI: one shared password over HTTP Basic auth (`UI_PASSWORD`) until user sign-in | Same |
| Database | Postgres 18 via `DATABASE_URL` | Postgres 18 via `DATABASE_URL` |
| Other services | Email sink / provider via `EMAIL_*` | Real email provider |
| Outbound HTTPS | `registry.npmjs.org` and `api.osv.dev` for dependency monitoring (free, no key). Blocked hosts only mark dependencies `unavailable` | Same |
| Who deploys | Agent may deploy via CI to UAT | Human only |

## Environment variables

| Name | What it is for | Where it is set |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection URL (`postgres://user:password@host:5432/db`) | Host env / secrets; local value in `.env.example` matches `docker-compose.yml` |
| `EMAIL_FROM` | From-address for notice alerts | Host env / secrets |
| `EMAIL_PROVIDER` | `sink` (tests) or provider id | Host env |
| `APP_URL` | Base URL of this app: links in email, and the address the UI server calls for `/api/*` | Host env |
| `APP_REGISTER_API_KEY` | Bearer key the UI server sends to the JSON API. Server side only, never `NEXT_PUBLIC_*`. Create it with `npm run api-key:create -- "UI"` | Host secrets |
| `UI_PASSWORD` | Shared password for every UI page (HTTP Basic auth; any username). Unset means the UI answers 503 to everyone. `/api/*` is not behind it | Host secrets |

Copy names into `.env.example` when the skeleton lands. Never commit `.env` files.

## Local and test databases

| Where | Database | How |
| --- | --- | --- |
| Local dev | Postgres 18 in Docker | `npm run db:up`, then `npm run db:migrate` |
| Unit tests | PGlite (in-process, in-memory) | Nothing to start; each test builds a fresh DB from `drizzle/` |
| CI | `postgres:18` service container | `npm run db:migrate` runs twice to prove migrations apply and are idempotent |

## API keys

Not environment variables: keys live hashed in the database (`api_keys`), with optional `expires_at` and relational scopes in `api_key_scopes`.

- **Full access** (no scope rows): `npm run api-key:create -- "<name>"` against that environment's `DATABASE_URL`. Use this for the UI server's `APP_REGISTER_API_KEY`. Store the printed key in the client's secret store, never in the repo.
- **Applications register** (Settings / `POST /api/api-keys`): scoped to apps, dependencies and hosting only; optional expiry date or no expiry. The full key is shown once in Settings (copyable). Revoke from Settings or with `npm run api-key:revoke -- <prefix|id>`.
- Expired and revoked keys get `401`. A scoped key on an out-of-scope route gets `403`.

Until user sign-in exists, anyone with `UI_PASSWORD` can open Settings and mint keys; that is the same trust boundary as every other UI write.

## Deploy flow

PR merged to `main` → CI gate green → human deploys/promotes UAT → human promotes PROD.

## Test accounts (UAT)

Documented in the README once auth exists. Passwords never live in the repo.
