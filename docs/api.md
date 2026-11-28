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
- **Scopes.** Keys from Settings (`POST /api/api-keys`) are scoped to the **Applications register**: create/read/update apps, add/import/read dependencies, and read/update hosting (including the hosting catalog). They get `403` on every other endpoint (people, notice alerts, monitoring refresh, key management, archive, dependency/hosting deletes and refreshes). Keys from `npm run api-key:create` (including the UI server's `APP_REGISTER_API_KEY`) have **full access** — no rows in `api_key_scopes`.
- **Expiry.** A key may have an `expires_at` (end of a chosen UTC calendar day) or none. Expired and revoked keys → `401`. Active keys record `last_used_at` on each successful auth.
- Create a full-access key: `npm run api-key:create -- "Front end"`. It prints the key **once**; store it in a secret manager. Or create a scoped key from Settings / `POST /api/api-keys` with `{ "name", "expiresOn": "YYYY-MM-DD" | null }`.
- List / revoke: `GET /api/api-keys`, `POST /api/api-keys/:id/revoke`. Revoke also works with `npm run api-key:revoke -- ar_AbC123` (prefix or id). Takes effect on the next request.
- Missing, malformed, unknown, revoked or expired key → `401 { error }` with `WWW-Authenticate: Bearer`. A valid key without the needed scope → `403 { error }`.
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

**A replay returns the same status and the resource's current state**, not a copy of the first response (which is what it was before migration `0004`). No response body is stored: the key's row holds the status code, the kind of resource (`app`, `person`, `dependency`, `hosting`, `notice_alert`, `dependency_import`, `api_key`) and its id, and the replay reads that resource again the way a `GET` would. An `api_key` replay never includes the secret (shown only on first create).

- Usually the two are the same. They differ when the resource changed in between: a replayed `POST /api/apps/:id/dependencies` shows what the check has found since, and a replay after someone else's edit shows that edit.
- If the resource has since been deleted (a dependency or hosting entry), the replay answers `404`, like any read. The write still ran only once.
- An import answers with counts, not a resource, so its four counts are stored as numbers and replayed exactly.
- Migration `0004` (and its rollback) deletes the keys stored so far, because the old rows held only a JSON copy of the response. A request first sent before it and retried after it runs again as new.

`GET` and `DELETE` are naturally safe to repeat: a second `DELETE` of the same row answers `404`. The refresh endpoints (`…/dependencies/refresh`, `…/hosting/refresh` and the three under `/api/monitoring/`) are also safe to repeat (they only re-check), so they take no `Idempotency-Key`.

## Conventions

- JSON in and out. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC.
- Errors are `{ "error": "<message>" }` with status 400 (validation), 401 (auth), 403 (scope), 404 (not found), 422 (idempotency conflict) or 500 (unexpected; logged by error code only).
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
| GET / POST | `/api/apps/:id/hosting` | List / add (one row per provider + service + region); a new row is checked straight away |
| PATCH / DELETE | `/api/apps/:id/hosting/:hostingId` | Update (then checked again) / remove |
| POST | `/api/apps/:id/hosting/refresh` | Check this app's hosting now → `{ hosting: Hosting[] }` (no Idempotency-Key) |
| GET | `/api/hosting/catalog` | Providers, their services and the runtimes the hosting check knows |
| POST | `/api/monitoring/refresh` | Both workspace checks, dependencies then hosting → `{ refresh: { dependencies, hosting } }`. **The daily scheduled job calls this one** (no Idempotency-Key) |
| POST | `/api/monitoring/dependencies/refresh` | Check every active app's dependencies (no Idempotency-Key) |
| POST | `/api/monitoring/hosting/refresh` | Check every active app's hosting → `{ refresh: { apps, hosting, failedSources } }` (no Idempotency-Key) |
| GET | `/api/people` | Active people, by name |
| POST | `/api/people` | Add (email trimmed, lowercased, unique per workspace) |
| PATCH | `/api/people/:id` | Rename, re-email, or `{"status":"left","leftOn":"YYYY-MM-DD"}`; `{"status":"active"}` reverses it |
| GET | `/api/notice-alerts` | `?status=`, `?appId=`; by due date; includes archived apps' history |
| POST | `/api/notice-alerts/:id/acknowledge` | Mark seen; first time wins; never changes the app |
| GET / POST | `/api/api-keys` | List keys / create a Settings-scoped key (`expiresOn` date or null); full key only on create |
| POST | `/api/api-keys/:id/revoke` | Revoke an active key |
| GET | `/api/settings/monitoring-sources` | Monitoring data sources in use (npm, OSV, endoflife.date, provider status feeds) |
| GET | `/api/openapi.json` | The spec (no key needed) |

## Business rules

- Creating an app with a notice deadline schedules one alert per offset in `NOTICE_ALERT_OFFSET_DAYS` whose due date is today or later (UTC).
- Changing the deadline deletes the app's `scheduled` alerts and schedules new ones. `sent` and `acknowledged` alerts stay as history. Moving the deadline back to one that already has a sent alert for an offset does not schedule that offset again.
- Two edits to the same app at once are serialized (row lock), so neither is lost.
- Owners must be active people when newly assigned. An app whose owner has left can still be edited.
- Dependencies are recorded by hand or imported; hosting is recorded by hand. Both are monitored (below).

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

- A check runs after an import, after a dependency is added or edited by hand, and on the refresh endpoints. It runs after the write has committed, never inside its transaction; if a source is down the write still succeeds.
- The check that follows a write holds up its response for at most 15 seconds. What it has not reached by then stays unchecked (status `na`) until the next refresh. It does not run again when a request is replayed for an `Idempotency-Key`. The refresh endpoints themselves have no overall limit.
- Each dependency stores `latestVersion`, `advisories`, `checkedAt` and `checkError`. One package failing never fails the refresh: `not_found` (not on the public registry: private, misspelt, or not an npm package), `unavailable` (a source gave no usable answer; the previous result is kept), `invalid_version` (the tracked version is a range or tag, so advisories cannot be checked).
- `checkedAt` is set only when the registry and OSV have both answered for the dependency's current name and version. It is `null` for a dependency not checked yet, one whose first check failed, one the registry does not know, and one whose version is a range. A later failed check keeps the earlier `checkedAt` and results, and adds `checkError: "unavailable"`.
- Changing a dependency's name or version (by `PATCH` or by an import) clears its advisories, `checkedAt` and `checkError`; a rename also clears `latestVersion`, unless the same request sends a new one. A check that was in flight for the old name or version is discarded.
- Nothing a source says is trusted. An answer over 1 MB, or not in the documented shape, counts as no answer (`unavailable`) and never replaces an earlier result. Each advisory is stored as text only: an id (at most 100 characters), up to 20 aliases, a severity from the known set (`unknown` otherwise), a summary cut at 300 characters, and a link that is always built from the id and points at osv.dev. Text the database cannot hold (a NUL, half of a cut emoji) is removed before storing. An advisory id recorded by hand (`vulnerabilities`) follows the same id rule: over 100 characters answers `400`.
- The workspace refresh skips an app that is archived while it runs and carries on with the rest.
- Only package names and versions are sent, with `User-Agent: app-register`, at most 6 requests at a time with an 8 second timeout that covers the whole answer, body included. A name that is not a valid npm package name is never sent. Names of private packages do reach the npm registry (as they would from `npm install`).
- Every dependency is treated as an npm package. A hand-added name that happens to match an unrelated public package would show that package's versions and advisories.

## Hosting check

Hosting rows are still `provider` and `service` text, so anything can be recorded. A row is **monitored** when those match the catalog in `src/lib/hosting-catalog.ts` (case, spaces and an "Azure " prefix do not matter); `GET /api/hosting/catalog` lists it. Optional `runtime` + `runtimeVersion` (e.g. `Node.js` `22`) say what an app service runs. `provider`, `service`, `region` and `runtime` are at most 100 characters, `version` and `runtimeVersion` at most 50; longer answers `400`.

Free sources, no account or key:

| Source | Request | Used for |
| --- | --- | --- |
| endoflife.date | `GET https://endoflife.date/api/v1/products/<product>` (the product comes from the catalog) | `endOfSupportOn` for the row's `version` and/or `runtimeVersion` |
| Statuspage (Vercel, Cloudflare, Netlify, GitHub) | `GET https://<status host>/api/v2/summary.json` | open incidents and scheduled maintenance |
| Google Cloud | `GET https://status.cloud.google.com/incidents.json` | open incidents |
| AWS Health | `GET https://health.aws.amazon.com/public/currentevents` | open events |
| Azure status | `GET https://rssfeed.azure.status.microsoft/en-us/status/feed/` | open incidents |

The check (`src/lib/services/hosting-monitor.ts`) writes, per row:

| Field | Meaning |
| --- | --- |
| `endOfSupportOn`, `endOfSupportSource` | The date and who set it. `manual`: sent by a client, never overwritten. `endoflife.date`: looked up from the service's `version` and/or the `runtimeVersion` (the earlier of the two). `isVersionInexact` is `true` when a version matched more than one release (below). A looked-up date is cleared when the row's provider, service, version or runtime changes, and only then (see the date rule below). |
| `incidents[]` | Open provider incidents and announced maintenance that reach the row (at most 20, outages on the row's own service first, so the cap never drops one for a lighter notice): `title`, `impact` (`major` / `minor` / `maintenance`), `scope` (`service` / `provider`), `url` (or `null`), `startedAt`. |
| `healthCheckedAt` | When the check last ran for the row as it is now; `null` until then. |
| `healthError` | Sources that could not be read last time, e.g. `Cloudflare status could not be reached (HTTP 503)`. What the row had from that source is kept. |

**How a version is matched to a release on endoflife.date.** `12`, `v12` and `12.4` are release `12`; `2022` is SQL Server's release labelled `2022 'Dallas'`. When a version matches more than one release (MySQL `8` is both `8.0` and `8.4`), the **earliest** end-of-support date among them is used, the cautious answer, and the row carries `isVersionInexact: true`; the UI then shows "Version is not exact; using the earliest matching release". Record the exact version (`8.4`) to get that release's own date. One exception: a product released in service packs (SQL Server) by its bare year (`2016`) means the latest service pack of that year (`2016 SP3`), the one still supported, and is not flagged.

**The date rule on `PATCH`** (what the edit form relies on):

| `endOfSupportOn` in the body | A date set by hand (`manual`) | A looked-up date (`endoflife.date`) or none |
| --- | --- | --- |
| left out | kept | kept, unless provider, service, version or runtime changed (then cleared and looked up again) |
| a date | replaced; stays `manual` | becomes `manual`, also when it equals the looked-up date |
| `null` | handed back to the check: date cleared, row unchecked (`na`) until a check completes | nothing changes |

The edit form leaves the field out unless the user changed it, so saving a row (to fix its region, say) never wipes a looked-up date. On `POST`, a date makes it `manual`; no date (or `null`) leaves it to the check.

Each row also carries two read-only fields worked out when it is read: `isMonitored` (it has an end-of-support date, or its provider's status feed is watched) and its own `status`: `critical` past end of support or in an outage, `attention` for any other finding, `ok` only when the row is monitored and its last check read every source, otherwise `na`. **A row that was never checked, or whose last check failed, is never `ok`**: it is `na`, and `healthError` (or `healthCheckedAt: null`) says why. The Hosting tab shows that reason beside the status.

Which incidents reach a row:

| The feed says | Result |
| --- | --- |
| It lists the row's service (and, if it lists regions, the row's region), or it names the row's region | `scope: service` |
| Its lists name another service, or another region | ignored |
| It cannot say (free-text service on the row, or Azure's prose-only feed naming neither) | a `major` incident is kept as `scope: provider`; a minor one or maintenance is ignored |
| Azure's prose names other regions and not the row's | `scope: provider` at most: a notice, never an outage on the row |
| It names regions, but the row's region is not a recognisable region of that provider | `scope: provider` when it lists the row's service or is `major`; otherwise ignored |

- **Services.** A feed's own list of affected services or components is read whole, however long (AWS lists well over 100 on a large event), and matched against the names the catalog has for that provider. Only the matches are kept.
- **Regions.** A region code is recognised by its shape and an availability zone is its region: AWS `us-east-1a` is `us-east-1`, Google Cloud `us-central1-b` is `us-central1`. A display name is accepted when the feed itself gives it (AWS `N. Virginia`, a Google Cloud location title). Azure regions are matched by their full display name as whole words, the longest name first: `Central US` is never found inside `North Central US`, `South Central US` or `West Central US`, nor `East US` in `East US 2`, nor `West US` in `West US 2` / `West US 3`; on a row, `centralus` and `Central US` are the same region. A row with no region is treated as possibly anywhere. A region that cannot be recognised (free text such as "our data centre", or a display name the feed does not give) is never silently dropped: see the last row of the table.

- A check runs after a hosting row is added or edited, on `POST …/hosting/refresh`, and for every active app on `POST /api/monitoring/hosting/refresh` or `POST /api/monitoring/refresh`. It always runs after the write has committed, never inside its transaction; if a source is down the write still succeeds. `POST` and `PATCH` answer with the row as saved, before the check.
- The check that follows a write holds up its response for at most 15 seconds (the same budget as the dependency check). A row whose sources have not answered by then stays unchecked (status `na`) until the next refresh. It does not run again when a stored response is replayed for an `Idempotency-Key`.
- One source failing never fails the check or wipes earlier results: it is named in `healthError`, and the date or incidents the row already had from it are kept.
- An answer is only stored while the row still has the provider, service, region, version, runtime and end-of-support date that were checked, and while its app is still active. An edit made while the sources were being asked wins; the workspace refresh skips an app that is archived while it runs and does not count it.
- Changing a row's provider, service, region, version or runtime clears its incidents, `healthCheckedAt` and `healthError` (and a looked-up date, unless only the region changed): they were about something else. Handing a manual date back to the check clears them too, so the row is `na`, never `ok`, until the date has been looked up.
- Nothing a source says is trusted. An answer over 4 MB, a redirect, or an answer not in the documented shape counts as no answer and never replaces an earlier result. At most 200 incidents are read from a feed (50 from Azure's free-text feed, 2,000 characters of each searched for service and region names) and 500 releases from an endoflife.date document; within an incident, the list of affected services is never cut. Titles are cut at 200 characters and control characters removed; an end-of-support date is used only if it is a real calendar date. Incidents are stored as rows of `hosting_incidents` (never as JSON), whose constraints refuse a missing or blank title and an unknown impact or scope; the link is checked against the provider's status host again when it is read.
- An incident link is kept only if it is an `https:` URL on the status host the catalog lists for the row's provider (for Statuspage it is built from the incident id on that host). Anything else is dropped and `url` is `null`: the incident still shows, without a link.
- Only catalog values are sent: the endoflife.date product and the fixed feed URLs, with `User-Agent: app-register`, at most 6 requests at a time with an 8 second timeout that covers the whole answer (a body that keeps dripping is cut off too). Nothing a person typed (provider, service, version, region) leaves the server.
- Public status pages only show what a provider chooses to publish, never account-specific incidents.

The daily job is one request, safe to repeat:

```bash
curl -fsS -X POST "$APP_REGISTER_URL/api/monitoring/refresh" -H "Authorization: Bearer $APP_REGISTER_API_KEY"
```

## Health score

Every app carries `health: { score, status, dimensions }`. It is the one place health lives: there is no separate hosting field.

- The score starts at 100 and loses points per deduction, never going below 0.
  - Dependencies: 10 per critical advisory, 5 per high, 2 per medium or unrated, 0 per low; 3 per runtime dependency a major version behind the latest, 1 per runtime dependency a minor version behind; 1 per dependency whose version is a range (its advisories cannot be checked). Dev dependencies lose no points for being behind.
  - Hosting: 25 per row past its end-of-support date; 12 per row whose end of support is today or within 90 days; 8 per open `major` incident with `scope: service` (an outage on the app's service or region); 3 per other stored incident (maintenance, a minor incident, or a major one that only names the provider). An incident shared by several rows counts once, at its heaviest.
- `points` is always a positive number of points taken off.
- `status`: below 80 is `critical`, below 95 is `attention`, otherwise `ok`.
- `dimensions` has one entry per dimension. `dependencies` and `hosting` are `{ status, deductions[] }`; `licence` and `pricing` are `null` until they are monitored. Each deduction is `{ dimension, label, detail, points }`. A dimension's own `status` follows the same thresholds on the points that dimension lost, so one outage alone (8 points) makes hosting `attention` while the row itself is `critical`.
- A dimension is `na` and contributes nothing when there is nothing to go on: no dependencies recorded or none checked yet; no hosting recorded, or no row that is monitored and checked. An app where both are `na` has `score: null` and status `na`. Either dimension alone is enough for a score.
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
