# JSON API

The **OpenAPI 3.1 spec is the source of truth** for every path, parameter and response shape: `src/lib/api/openapi.ts`, served at `GET /api/openapi.json` (public; paste it into any OpenAPI viewer such as Swagger Editor). Tests check every real response against it, and check that every route file is listed in it, so it cannot drift from the code.

Route handlers live in `src/app/api/`. Each one goes through `handle()` in `src/lib/api/http.ts`, which does auth, idempotency and error mapping in one place.

## Authentication

Every request except `GET /api/openapi.json` needs:

```
Authorization: Bearer ar_…
```

- The key decides the workspace. A key only ever reads or writes its own workspace's rows; an id from another workspace answers 404.
- Keys are 256 random bits. Only their SHA-256 hash is stored (`api_keys.key_hash`), plus the first 9 characters (`ar_` + 6) in plain text so a person can tell keys apart. Those 6 characters are part of the key (36 of its 256 bits); the rest is never stored.
- Create a key: `npm run api-key:create -- "Front end"`. It prints the key **once**; store it in a secret manager.
- Revoke a key: `npm run api-key:revoke -- ar_AbC123` (the prefix printed at creation), or by its id. If two active keys ever share a prefix, it refuses and asks for the id. Takes effect on the next request.
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
| More than 24 hours later | The key is forgotten; the request runs as new. Expired rows (which hold a copy of the response, possibly names and emails) are deleted on the next POST/PATCH in any workspace. |

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
| GET | `/api/apps/:id` | One app (archived too) with `alerts`, `dependencies`, `hosting`. Like the list, it carries `hostingHealth: { status, deductions[] }` |
| PATCH | `/api/apps/:id` | Update an active app; a new deadline replaces scheduled alerts |
| POST | `/api/apps/:id/archive` | Soft delete: hides it, frees its name, drops scheduled alerts |
| GET / POST | `/api/apps/:id/dependencies` | List / add (name unique per app, case-insensitive) |
| PATCH / DELETE | `/api/apps/:id/dependencies/:dependencyId` | Update / remove |
| GET / POST | `/api/apps/:id/hosting` | List / add (one row per provider + service + region). Adding runs the hosting check before it answers |
| PATCH / DELETE | `/api/apps/:id/hosting/:hostingId` | Update (checks again) / remove |
| POST | `/api/apps/:id/hosting/refresh` | Run the hosting check for one app now → `{ hosting: Hosting[] }` |
| POST | `/api/monitoring/hosting/refresh` | Run the hosting check for every active app in the workspace → `{ refreshed: { apps, hosting, failedSources } }`. For a daily job |
| GET | `/api/hosting/catalog` | Providers, their services and the runtimes the hosting check knows |
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
- Dependencies are recorded by hand. There is no scanning or overall health score yet.

## Hosting check

Hosting rows are still `provider` and `service` text, so anything can be recorded. A row is **monitored** when those match the catalog in `src/lib/hosting-catalog.ts` (case, spaces and an "Azure " prefix do not matter); `GET /api/hosting/catalog` lists it. Optional `runtime` + `runtimeVersion` (e.g. `Node.js` `22`) say what an app service runs.

The check (`src/lib/services/hosting-monitor.ts`) runs when a row is added or edited, on `POST …/hosting/refresh`, and for the whole workspace on `POST /api/monitoring/hosting/refresh`. It writes, per row:

| Field | Meaning |
| --- | --- |
| `endOfSupportOn`, `endOfSupportSource` | The date and who set it. `manual`: sent by a client, never overwritten. `endoflife.date`: looked up from the service's `version` and/or the `runtimeVersion` (the earlier of the two). Send `endOfSupportOn: null` to hand a manual date back to the check. A looked-up date is cleared when the row's provider, service, version or runtime changes. |
| `incidents[]` | Open provider incidents and announced maintenance that reach the row: `title`, `impact` (`major` / `minor` / `maintenance`), `scope` (`service` / `provider`), `url`, `startedAt`. |
| `healthCheckedAt` | When the check last ran for the row. |
| `healthError` | Sources that could not be read last time, e.g. `Cloudflare status could not be reached (HTTP 503)`. What the row had from that source is kept. |

Which incidents reach a row: the feed names the row's service or region → `scope: service`. The feed names another service or region → ignored. The feed cannot say (free-text service, or Azure's prose-only feed) → a `major` incident is kept as `scope: provider`; a minor one or maintenance is ignored.

`hostingHealth` on every app is worked out from those stored fields when the app is read (no network):

| Finding | Points |
| --- | --- |
| A row is past its end-of-support date | −25 |
| A row's end of support is today or within 90 days | −12 |
| An open `major` incident with `scope: service` (an outage on the app's service or region) | −8 |
| Any other stored incident: maintenance, a minor incident, or a major one that only names the provider | −3 |

An incident shared by several rows counts once. `status` is `critical` if any −25 or −8 applies, `attention` for any other finding, `ok` when there are none, and `na` when there is nothing to judge (no hosting rows, or none with an end-of-support date or a monitored provider). `deductions[]` use the shape `{ dimension: "hosting", label, detail, points }` so they can feed the overall health score.

The daily job: `POST /api/monitoring/hosting/refresh` with a bearer key and a **new** `Idempotency-Key` each day (a repeated key replays yesterday's answer for 24 hours).

## Example

```bash
curl -X POST http://localhost:3000/api/apps \
  -H "Authorization: Bearer $APP_REGISTER_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"Contoso CRM","kind":"saas","ownerId":"…","backupOwnerId":"…","noticeDeadline":"2027-09-30"}'
```
