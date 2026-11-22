import {
  APP_LIST_SORT,
  END_OF_SUPPORT_SOON_DAYS,
  FILTER_ALL,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  MS_PER_DAY,
  type AppListSort,
} from "@/lib/constants";
import type { App, Hosting, HostingIncident } from "./api-client";

/**
 * Display-only shaping of data the pages already loaded: search, filters,
 * sort order and short lists. No business rules; those stay in the API.
 */

/** Applications whose name contains the search text, ignoring case and surrounding spaces. */
export function filterAppsByName<T extends { name: string }>(
  apps: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  return needle
    ? apps.filter((app) => app.name.toLowerCase().includes(needle))
    : apps;
}

export type AppListView = { query: string; kind: string; sort: AppListSort };

/** The applications list as the filters ask: name search, kind, then sort. Health sorting has no data yet, so it keeps name order. */
export function applyAppListView(apps: App[], view: AppListView): App[] {
  const byKind =
    view.kind === FILTER_ALL
      ? apps
      : apps.filter((app) => app.kind === view.kind);
  const shown = [...filterAppsByName(byKind, view.query)];
  if (view.sort === APP_LIST_SORT.renewal) {
    return shown.sort(byRenewalThenName);
  }
  return shown.sort((a, b) => a.name.localeCompare(b.name));
}

function byRenewalThenName(a: App, b: App): number {
  if (a.renewalDate === b.renewalDate) {
    return a.name.localeCompare(b.name);
  }
  if (a.renewalDate === null) return 1;
  if (b.renewalDate === null) return -1;
  return a.renewalDate.localeCompare(b.renewalDate);
}

/** Applications with a renewal date, soonest first. */
export function appsWithRenewal(apps: App[]): App[] {
  return apps.filter((app) => app.renewalDate !== null).sort(byRenewalThenName);
}

/** Applications whose notice deadline is today (UTC YYYY-MM-DD) or later, soonest first. */
export function upcomingNoticeDeadlines(apps: App[], today: string): App[] {
  return apps
    .filter((app) => app.noticeDeadline !== null && app.noticeDeadline >= today)
    .sort(
      (a, b) =>
        (a.noticeDeadline ?? "").localeCompare(b.noticeDeadline ?? "") ||
        a.name.localeCompare(b.name),
    );
}

/** The first hosting row as "Provider Service", or null when none is recorded. */
export function primaryHosting(hosting: Hosting[]): string | null {
  const first = hosting[0];
  return first ? `${first.provider} ${first.service}` : null;
}

/** Up to two capital letters for an application's icon: "Customer Portal" → "CP", "Slack" → "S". */
export function appInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word));
  const letters =
    words.length > 1
      ? words.slice(0, 2).map((word) => word[0])
      : [words[0]?.[0] ?? ""];
  return letters.join("").toUpperCase();
}

/** Icon colours from the prototype's palette, picked by name so an app keeps its colour. */
export const APP_ICON_COLORS = [
  "blue",
  "gray",
  "pink",
  "green",
  "orange",
  "purple",
] as const;
export type AppIconColor = (typeof APP_ICON_COLORS)[number];

export function appIconColor(name: string): AppIconColor {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return APP_ICON_COLORS[hash % APP_ICON_COLORS.length];
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-12-12" → "12 Dec 2026", as the prototype shows dates. */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** "2026-11-22T22:40:00Z" → "22 Nov 2026, 22:40 UTC". */
export function formatDateTime(iso: string): string {
  return `${DATE_TIME_FORMAT.format(new Date(iso))} UTC`;
}

export type StatusTone = "red" | "yellow";

/** The badge next to an end-of-support date: past, or within 90 days of `today` (UTC YYYY-MM-DD); null when further away. */
export function endOfSupportNote(
  endOfSupportOn: string,
  today: string,
): { label: string; tone: StatusTone } | null {
  const days = Math.round(
    (Date.parse(endOfSupportOn) - Date.parse(today)) / MS_PER_DAY,
  );
  if (days < 0) {
    return { label: "Past end of support", tone: "red" };
  }
  if (days > END_OF_SUPPORT_SOON_DAYS) {
    return null;
  }
  if (days === 0) {
    return { label: "EOS today", tone: "yellow" };
  }
  return { label: `EOS in ${days} ${days === 1 ? "day" : "days"}`, tone: "yellow" };
}

/** "12", "Node.js 18" or "12 · Node.js 18": what version of what a hosting row runs. */
export function hostingVersion(hosting: Hosting): string | null {
  const runtime = [hosting.runtime, hosting.runtimeVersion]
    .filter(Boolean)
    .join(" ");
  return [hosting.version, runtime].filter(Boolean).join(" · ") || null;
}

export type IncidentRow = HostingIncident & {
  key: string;
  /** The hosting rows it reaches, e.g. "Azure App Service, Azure Storage". */
  affects: string;
  kind: { label: string; tone: StatusTone };
};

/** An app's open incidents, each once, with the hosting rows it reaches. Outages first. */
export function openIncidents(hosting: Hosting[]): IncidentRow[] {
  const rows = new Map<string, IncidentRow>();
  for (const row of hosting) {
    for (const incident of row.incidents) {
      const key = `${incident.url} ${incident.title}`;
      const name = `${row.provider} ${row.service}`;
      const known = rows.get(key);
      rows.set(key, {
        ...incident,
        key,
        affects: known ? `${known.affects}, ${name}` : name,
        kind: known?.kind === OUTAGE ? OUTAGE : incidentKind(incident),
      });
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      Number(b.kind === OUTAGE) - Number(a.kind === OUTAGE) ||
      a.title.localeCompare(b.title),
  );
}

const OUTAGE: IncidentRow["kind"] = { label: "Outage", tone: "red" };

/** Only a major incident the feed ties to the row's own service or region is called an outage. */
function incidentKind(incident: HostingIncident): IncidentRow["kind"] {
  if (
    incident.impact === INCIDENT_IMPACT.major &&
    incident.scope === INCIDENT_SCOPE.service
  ) {
    return OUTAGE;
  }
  if (incident.impact === INCIDENT_IMPACT.maintenance) {
    return { label: "Maintenance", tone: "yellow" };
  }
  return { label: "Notice", tone: "yellow" };
}

/** When the hosting check last ran for any of these rows, or null if it never has. */
export function lastChecked(hosting: Hosting[]): string | null {
  const times = hosting.flatMap((row) => row.healthCheckedAt ?? []).sort();
  return times.at(-1) ?? null;
}

/** The sources the last check could not read, each named once. */
export function checkErrors(hosting: Hosting[]): string[] {
  return [
    ...new Set(hosting.flatMap((row) => row.healthError?.split("; ") ?? [])),
  ];
}
