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
| First request with a key | Runs normally; for a 2xx the status code and which resource it answered about are recorded |
| Same key, same method, path and body (a double-click, or a retry after a timeout) | Nothing runs again. The answer is a replay: the same status code as the first time, and the resource's current state. This holds even when both requests arrive at the same moment. |
| Same key, different method, path or body | `422`, nothing written |
| First request failed (4xx or 5xx) | Nothing is stored, so a retry with the same key runs normally |
| More than 24 hours later | The key is forgotten; the request runs as new. Expired rows are deleted on the next POST/PATCH in any workspace. |

Bodies are compared byte for byte, so send the same JSON text when retrying. Keys are scoped per workspace.

How it works: the key is claimed inside the same database transaction as the write. A concurrent duplicate waits on that claim, then reads what the first one recorded. Exactly one request does the work.

**A replay returns the same status and the resource's current state**, not a copy of the first response (which is what it was before migration `0004`). No response body is stored: the key's row holds the status code, the kind of resource (`app`, `person`, `dependency`, `hosting`, `notice_alert`, `dependency_import`) and its id, and the replay reads that resource again the way a `GET` would.

- Usually the two are the same. They differ when the resource changed in between: a replayed `POST /api/apps/:id/dependencies` shows what the check has found since, and a replay after someone else's edit shows that edit.
- If the resource has since been deleted (a dependency or hosting entry), the replay answers `404`, like any read. The write still ran only once.
- An import answers with counts, not a resource, so its four counts are stored as numbers and replayed exactly.
- Migration `0004` (and its rollback) deletes the keys stored so far, because the old rows held only a JSON copy of the response. A request first sent before it and retried after it runs again as new.

`GET` and `DELETE` are naturally safe to repeat: a second `DELETE` of the same row answers `404`. The two dependency refresh endpoints are also safe to repeat (they only re-check), so they take no `Idempotency-Key`.

## Conventions

- JSON in and out. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC.
- Errors are `{ "error": "<message>" }` with status 400 (validation), 401 (auth), 404 (not found), 422 (idempotency conflict) or 500 (unexpected; logged by error code only).
- Ids are UUIDs. A malformed id answers 404 (path) or 400 (query).

## Endpoints

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/apps` | Active apps. `?kind=`, `?sort=name\|notice_deadline`, `?noticeDeadlineWithinDays=0–36500` |
| POST | `/api/apps` | Create; schedules notice alerts |
| GET | `/api/apps/:id` | One app (archived too) with `alerts`, `dependencies`, `hosting` and `health` |
| PATCH | `/api/apps/:id` | Update an active app; a new deadline replaces scheduled alerts |
| POST | `/api/apps/:id/archive` | Soft delete: hides it, frees its name, drops scheduled alerts |
| GET / POST | `/api/apps/:id/dependencies` | List / add (name unique per app, case-insensitive); a new one is checked straight away |
| PATCH / DELETE | `/api/apps/:id/dependencies/:dependencyId` | Update (then checked again) / remove |
| POST | `/api/apps/:id/dependencies/import` | Body is a `package.json` or `package-lock.json`; imports the direct dependencies, then checks them |
| POST | `/api/apps/:id/dependencies/refresh` | Check this app's dependencies now (no Idempotency-Key) |
| POST | `/api/monitoring/dependencies/refresh` | Check every active app's dependencies; the daily scheduled job calls this (no Idempotency-Key) |
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
- Hosting is recorded by hand. Dependencies are recorded by hand or imported, and monitored (below).

## Dependency import

`POST /api/apps/:id/dependencies/import` takes the file itself as the body: an npm `package.json`, or a `package-lock.json` made by npm 7 or newer (`lockfileVersion` 2 or 3). At most 5 MB. Answers `{ "import": { "added", "updated", "unchanged", "removed" } }`.

A pipeline can post its lockfile on every build:

```bash
curl -fsS -X POST "$APP_REGISTER_URL/api/apps/$APP_ID/dependencies/import" -H "Authorization: Bearer $APP_REGISTER_API_KEY" -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" --data-binary @package-lock.json
```

- A file is a package file only if it has `lockfileVersion` and `packages`, or at least one of `dependencies`, `devDependencies` and `optionalDependencies` (an empty object counts). Any other JSON answers `400` and changes nothing, so a stray file can never empty an app's dependencies.
- Only direct dependencies are taken: `dependencies`, `optionalDependencies` (both runtime) and `devDependencies` (flagged `isDev`). A name in several lists is recorded once, as a runtime dependency if any list makes it one. Transitive packages are left out.
- A lockfile gives the exact installed version (`packages["node_modules/<name>"].version`). A `package.json` gives its range with the operators stripped (`^16.4.6` → `16.4.6`); a tag such as `latest` is kept as written, and an empty range means any version (`*`).
- **A version that is not exact cannot be checked for advisories.** `^16` (stored as `16`), `~3.9`, `4.x`, `*` and tags are ranges: the dependency gets `checkError: "invalid_version"`, status `attention` and costs 1 point, with the note "Version is a range; import package-lock.json for exact versions". It is never `ok`. Its latest version is still looked up, and a major-only or major.minor version is still compared with it (`16` against `19.0.0` is a major version behind).
- An npm alias is recorded under the real package name: the lockfile entry's `name`, or the name in `npm:<name>@<version>` in a `package.json`.
- Names are trimmed. Two entries of one list with the same name after trimming (ignoring case) answer `400` naming the package. A name longer than 214 characters (npm's limit) or a version longer than 256 answers `400`; the same limits apply when a dependency is added or edited by hand.
- Imports of one app run one at a time (each locks the app's row), so two pipelines posting at once both succeed.
- Matching is by name, ignoring case. New names are added with `source: "import"`. Known names get the file's version. A name the file no longer lists is removed only if an earlier import created it; dependencies added by hand (`source: "manual"`) are never removed.
- Malformed JSON, a JSON file that is not a package file, an npm 6 lockfile, or a file over 5 MB answers `400` and changes nothing. The API key is checked first (`401`), and the size cap is enforced while the body is read, with or without a `Content-Length`.

## Dependency monitoring

Two free sources, no account or key:

| Source | Request | Used for |
| --- | --- | --- |
| npm registry | `GET https://registry.npmjs.org/<name>/latest` (a scoped name as `@scope%2Fname`) | `latestVersion`; a `404` marks the dependency `checkError: "not_found"` |
| OSV.dev | `POST https://api.osv.dev/v1/querybatch` with `{package: {name, ecosystem: "npm"}, version}` per dependency (following `next_page_token`, at most 10 pages), then `GET https://api.osv.dev/v1/vulns/<id>` | `advisories`: id, aliases, severity (GitHub's rating in `database_specific.severity`), summary, link |

- A check runs after an import, after a dependency is added or edited by hand, and on the two refresh endpoints. It runs after the write has committed, never inside its transaction; if a source is down the write still succeeds.
- The check that follows a write holds up its response for at most 15 seconds. What it has not reached by then stays unchecked (status `na`) until the next refresh. It does not run again when a request is replayed for an `Idempotency-Key`. The refresh endpoints themselves have no overall limit.
- Each dependency stores `latestVersion`, `advisories`, `checkedAt` and `checkError`. One package failing never fails the refresh: `not_found` (not on the public registry: private, misspelt, or not an npm package), `unavailable` (a source gave no usable answer; the previous result is kept), `invalid_version` (the tracked version is a range or tag, so advisories cannot be checked).
- `checkedAt` is set only when the registry and OSV have both answered for the dependency's current name and version. It is `null` for a dependency not checked yet, one whose first check failed, one the registry does not know, and one whose version is a range. A later failed check keeps the earlier `checkedAt` and results, and adds `checkError: "unavailable"`.
- Changing a dependency's name or version (by `PATCH` or by an import) clears its advisories, `checkedAt` and `checkError`; a rename also clears `latestVersion`, unless the same request sends a new one. A check that was in flight for the old name or version is discarded.
- Nothing a source says is trusted. An answer over 1 MB, or not in the documented shape, counts as no answer (`unavailable`) and never replaces an earlier result. Each advisory is stored as text only: an id (at most 100 characters), up to 20 aliases, a severity from the known set (`unknown` otherwise), a summary cut at 300 characters, and a link that is always built from the id and points at osv.dev. Text the database cannot hold (a NUL, half of a cut emoji) is removed before storing. An advisory id recorded by hand (`vulnerabilities`) follows the same id rule: over 100 characters answers `400`.
- The workspace refresh skips an app that is archived while it runs and carries on with the rest.
- Only package names and versions are sent, with `User-Agent: app-register`, at most 6 requests at a time with an 8 second timeout. A name that is not a valid npm package name is never sent. Names of private packages do reach the npm registry (as they would from `npm install`).
- Every dependency is treated as an npm package. A hand-added name that happens to match an unrelated public package would show that package's versions and advisories.

## Health score

Every app carries `health: { score, status, dimensions }`.

- The score starts at 100 and loses points per deduction, never going below 0: 10 per critical advisory, 5 per high, 2 per medium or unrated, 0 per low; 3 per runtime dependency a major version behind the latest, 1 per runtime dependency a minor version behind; 1 per dependency whose version is a range (its advisories cannot be checked). Dev dependencies lose no points for being behind.
- `status`: below 80 is `critical`, below 95 is `attention`, otherwise `ok`. An app with no dependencies recorded, or whose dependencies all have status `na` (none checked yet), has `score: null` and status `na`.
- `dimensions` has one entry per dimension: `dependencies` is `{ status, deductions[] }`; `hosting`, `licence` and `pricing` are `null` until they are monitored. Each deduction is `{ dimension, label, detail, points }`.
- Each dependency also has its own `status`: `critical` with a critical or high advisory; `attention` with anything else that costs points (a version that is a range always does); `ok` only when the registry and OSV have both answered for its current name and version; otherwise `na`, with the reason in `checkError` (`null` there means it has not been checked yet). The Dependencies tab shows that reason beside the status.
- An advisory id recorded by hand (`vulnerabilities`) counts once: not again when monitoring finds the same advisory under that id or an alias, and as unrated when monitoring does not know it.

## Example

```bash
curl -X POST http://localhost:3000/api/apps \
  -H "Authorization: Bearer $APP_REGISTER_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"Contoso CRM","kind":"saas","ownerId":"…","backupOwnerId":"…","noticeDeadline":"2027-09-30"}'
```
