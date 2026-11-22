# JSON API

Route handlers live in `src/app/api/`. Every request acts on the current workspace (`getCurrentWorkspaceId()`; the default workspace until sign-in exists). A row from another workspace is treated as not found.

**No authentication yet.** Anyone who can reach the server can read and write. Do not expose it publicly until the auth issue lands.

## Conventions

- JSON in and out. Dates are `YYYY-MM-DD` strings; timestamps are ISO 8601 strings (UTC).
- Errors: `400 { "error": "<message>" }` for invalid input (including bad query params and duplicate names/emails), `404 { "error": "<message>" }` for an unknown, malformed or other-workspace id, `500 { "error": "Internal error" }` otherwise.
- Ids are UUIDs.

## Endpoints

| Method | Path | Body / query | Success |
| --- | --- | --- | --- |
| GET | `/api/apps` | `?kind=<APP_KINDS>&sort=name\|notice_deadline&noticeDeadlineWithinDays=<int ≥ 0>` | `200 { apps: App[] }` — active (not archived) apps only |
| POST | `/api/apps` | `AppInput` | `201 { app: AppDetail }` — schedules notice alerts |
| GET | `/api/apps/:id` | — | `200 { app: AppDetail }` (archived apps too, `archivedAt` set) |
| PATCH | `/api/apps/:id` | any subset of `AppInput`; `null` clears an optional field | `200 { app: AppDetail }` — active apps only |
| GET | `/api/people` | — | `200 { people: Person[] }` — active people, by name |
| POST | `/api/people` | `{ name, email }` | `201 { person: Person }` — email trimmed and lowercased |
| GET | `/api/notice-alerts` | `?status=scheduled\|sent\|acknowledged&appId=<uuid>` | `200 { alerts: NoticeAlert[] }` — by due date |
| POST | `/api/notice-alerts/:id/acknowledge` | — | `200 { alert: NoticeAlert }` — idempotent; never changes the app |

`noticeDeadlineWithinDays=N` keeps apps whose notice deadline is between today and today + N days (inclusive).

## Shapes

TypeScript sources of truth: `AppView`, `AppDetailView` (`src/lib/services/apps.ts`), `PersonView` (`src/lib/services/people.ts`), `NoticeAlertView` (`src/lib/services/notice-alerts.ts`).

```ts
type AppInput = {
  name: string;                 // required; unique per workspace among active apps (case-insensitive)
  kind: 'saas' | 'in_house' | 'citizen_built' | 'vendor_service';
  ownerId: string;              // active person in this workspace
  backupOwnerId: string;        // active person, not the owner
  category?: string | null;
  vendor?: string | null;
  description?: string | null;
  renewalDate?: string | null;  // YYYY-MM-DD
  noticeDeadline?: string | null; // YYYY-MM-DD, on or before renewalDate
  billingCycle?: string | null;
  costCents?: number | null;    // whole cents, ≥ 0
  runtimeLocation?: string | null;      // required for in_house / citizen_built
  dataAndKeys?: string | null;          // required for in_house / citizen_built
  whatBreaksIfStopped?: string | null;  // required for in_house / citizen_built
};

type App = Omit<AppInput, 'ownerId' | 'backupOwnerId'> & {
  id: string;
  owner: { id: string; name: string };
  backupOwner: { id: string; name: string };
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AppDetail = App & { alerts: NoticeAlert[] };

type Person = {
  id: string; name: string; email: string;
  status: 'active' | 'left'; leftOn: string | null;
  createdAt: string; updatedAt: string;
};

type NoticeAlert = {
  id: string; appId: string; appName: string;
  noticeDeadline: string;   // the app's deadline when the alert was scheduled
  offsetDays: number;       // 90, 60 or 30
  dueOn: string;            // noticeDeadline - offsetDays
  status: 'scheduled' | 'sent' | 'acknowledged';
  sentAt: string | null; acknowledgedAt: string | null; acknowledgedById: string | null;
  createdAt: string; updatedAt: string;
};
```

## Alert rules

- Creating an app with a notice deadline schedules one alert per offset in `NOTICE_ALERT_OFFSET_DAYS` whose due date is today or later (UTC).
- Changing the deadline deletes the app's `scheduled` alerts and schedules new ones; `sent` and `acknowledged` alerts stay as history. If the deadline moves back to one that already has a sent alert for an offset, that offset is not scheduled again.
- Archiving an app (service only, no endpoint yet) deletes its `scheduled` alerts.
