# JSON API

The **OpenAPI 3.1 spec is the source of truth** for every path, parameter and response shape: `src/lib/api/openapi.ts`, served at `GET /api/openapi.json` (public; paste it into any OpenAPI viewer such as Swagger Editor). Tests check every real response against it, and check that every route file is listed in it, so it cannot drift from the code.

Route handlers live in `src/app/api/`. Each one goes through `handle()` in `src/lib/api/http.ts`, which does auth, idempotency and error mapping in one place.

## Authentication

Every request except `GET /api/openapi.json` needs:

```
Authorization: Bearer ar_…
```

- The key decides the workspace. A key only ever reads or writes its own workspace's rows; an id from another workspace answers 404.
- Keys are 256 random bits. Only their SHA-256 hash is stored (`api_keys.key_hash`), plus a short non-secret prefix (`ar_` + 6 characters) so a person can tell keys apart.
- Create a key: `npm run api-key:create -- "Front end"`. It prints the key **once**; store it in a secret manager.
- Revoke a key: `npm run api-key:revoke -- ar_AbC123` (the prefix printed at creation). Takes effect on the next request.
- Missing, malformed, unknown or revoked key → `401 { error }` with `WWW-Authenticate: Bearer`.
- Until sign-in exists, the scripts create keys for the default workspace.

## Duplicate requests (Idempotency-Key)

`POST` and `PATCH` must send an `Idempotency-Key` header: any unique string, 1–255 characters. Generate a new UUID per user action (per Save click), and reuse it when retrying that same action.

| Situation | Result |
| --- | --- |
| No header, or longer than 255 characters | `400`, nothing written |
| First request with a key | Runs normally; a 2xx response is stored |
| Same key, same method, path and body (a double-click, or a retry after a timeout) | The stored response is replayed. Nothing runs again. This holds even when both requests arrive at the same moment. |
| Same key, different method, path or body | `422`, nothing written |
| First request failed (4xx or 5xx) | Nothing is stored, so a retry with the same key runs normally |
| More than 24 hours later | The key is forgotten; the request runs as new |

Bodies are compared byte for byte, so send the same JSON text when retrying. Keys are scoped per workspace.

How it works: the key is claimed inside the same database transaction as the write. A concurrent duplicate waits on that claim, then reads the committed response. Exactly one request does the work.

`GET` and `DELETE` are naturally safe to repeat: a second `DELETE` of the same row answers `404`.

## Conventions

- JSON in and out. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC.
- Errors are `{ "error": "<message>" }` with status 400 (validation), 401 (auth), 404 (not found), 422 (idempotency conflict) or 500 (unexpected; logged by error code only).
- Ids are UUIDs. A malformed id answers 404 (path) or 400 (query).

## Endpoints

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/apps` | Active apps. `?kind=`, `?sort=name\|notice_deadline`, `?noticeDeadlineWithinDays=0–36500` |
| POST | `/api/apps` | Create; schedules notice alerts |
| GET | `/api/apps/:id` | One app (archived too) with `alerts`, `dependencies`, `hosting` |
| PATCH | `/api/apps/:id` | Update an active app; a new deadline replaces scheduled alerts |
| POST | `/api/apps/:id/archive` | Soft delete: hides it, frees its name, drops scheduled alerts |
| GET / POST | `/api/apps/:id/dependencies` | List / add (name unique per app, case-insensitive) |
| PATCH / DELETE | `/api/apps/:id/dependencies/:dependencyId` | Update / remove |
| GET / POST | `/api/apps/:id/hosting` | List / add (one row per provider + service + region) |
| PATCH / DELETE | `/api/apps/:id/hosting/:hostingId` | Update / remove |
| GET | `/api/people` | Active people, by name |
| POST | `/api/people` | Add (email trimmed, lowercased, unique per workspace) |
| PATCH | `/api/people/:id` | Rename, re-email, or `{"status":"left","leftOn":"YYYY-MM-DD"}`; `{"status":"active"}` reverses it |
| GET | `/api/notice-alerts` | `?status=`, `?appId=`; by due date; includes archived apps' history |
| POST | `/api/notice-alerts/:id/acknowledge` | Mark seen; first time wins; never changes the app |
| GET | `/api/openapi.json` | The spec (no key needed) |

## Business rules

- Creating an app with a notice deadline schedules one alert per offset in `NOTICE_ALERT_OFFSET_DAYS` whose due date is today or later (UTC).
- Changing the deadline deletes the app's `scheduled` alerts and schedules new ones. `sent` and `acknowledged` alerts stay as history. Moving the deadline back to one that already has a sent alert for an offset does not schedule that offset again.
- Two edits to the same app at once are serialized (row lock), so neither is lost.
- Owners must be active people when newly assigned. An app whose owner has left can still be edited.
- Dependencies and hosting are recorded by hand. There is no scanning, health score or outside source yet.

## Example

```bash
curl -X POST http://localhost:3000/api/apps \
  -H "Authorization: Bearer $APP_REGISTER_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"Contoso CRM","kind":"saas","ownerId":"…","backupOwnerId":"…","noticeDeadline":"2027-09-30"}'
```
