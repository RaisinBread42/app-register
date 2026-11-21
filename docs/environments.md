# Environments

Variable **names** only, never values.

| | UAT | PROD |
| --- | --- | --- |
| URL | TBD (preview / single VM) | TBD |
| Hosting | Single Node process (Next.js) | Same shape; human-promoted |
| Auth | TBD (not in first skeleton) | TBD |
| Database | SQLite file path via `DATABASE_URL` | SQLite or Postgres via same Drizzle schema |
| Other services | Email sink / provider via `EMAIL_*` | Real email provider |
| Who deploys | Agent may deploy via CI to UAT | Human only |

## Environment variables

| Name | What it is for | Where it is set |
| --- | --- | --- |
| `DATABASE_URL` | SQLite file URL or Postgres URL | Host env / secrets |
| `EMAIL_FROM` | From-address for notice alerts | Host env / secrets |
| `EMAIL_PROVIDER` | `sink` (tests) or provider id | Host env |
| `APP_URL` | Public base URL for links in email | Host env |

Copy names into `.env.example` when the skeleton lands. Never commit `.env` files.

## Deploy flow

PR merged to `main` → CI gate green → human deploys/promotes UAT → human promotes PROD.

## Test accounts (UAT)

Documented in the README once auth exists. Passwords never live in the repo.
