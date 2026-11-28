import {
  ADVISORY_SEVERITIES,
  END_OF_SUPPORT_SOON_DAYS,
  HEALTH_DIMENSIONS,
  HEALTH_STATUS,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  MS_PER_DAY,
} from "@/lib/constants";
import type {
  Advisory,
  AppDetail,
  Deduction,
  Dependency,
  Health,
  Hosting,
  HostingIncident,
} from "./api-client";
import { CHECK_ERROR_LABEL, DIMENSION_NAME, NOT_CHECKED_YET, NOT_MONITORED } from "./copy";

/**
 * Display-only shaping of data the pages already loaded: dates, statuses,
 * check notes and short lists. No business rules; those stay in the API.
 */

/** Advisory ids recorded by hand that monitoring did not find under any of its ids. */
export function handRecordedAdvisories(dependency: Dependency): string[] {
  const found = new Set(
    dependency.advisories
      .flatMap((advisory) => [advisory.id, ...advisory.aliases])
      .map((id) => id.toUpperCase()),
  );
  return dependency.vulnerabilities.filter((id) => !found.has(id.toUpperCase()));
}

/** Advisories with the most severe first (critical, high, medium, low, unrated). */
export function worstAdvisoriesFirst(advisories: Advisory[]): Advisory[] {
  const rank = (advisory: Advisory) => ADVISORY_SEVERITIES.indexOf(advisory.severity);
  return [...advisories].sort((a, b) => rank(a) - rank(b));
}

/**
 * The note beside a dependency's status pill: why its last check gave no full
 * answer, or that it has not been checked yet. Null when there is nothing to add.
 */
export function statusNote(dependency: Dependency): string | null {
  if (dependency.checkError) {
    return CHECK_ERROR_LABEL[dependency.checkError];
  }
  return dependency.status === HEALTH_STATUS.na ? NOT_CHECKED_YET : null;
}

/** The most recent complete check (registry and advisories) among an app's dependencies, as YYYY-MM-DD, or null. */
export function lastChecked(dependencies: Dependency[]): string | null {
  const dates = dependencies.flatMap((dependency) => dependency.checkedAt ?? []).sort();
  return dates.at(-1)?.slice(0, 10) ?? null;
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

/**
 * Why a hosting row has no status, or null when it has one: its last check
 * failed (the sources are named), it has not been checked yet, or nothing
 * about it is monitored.
 */
export function hostingStatusReason(hosting: Hosting): string | null {
  if (hosting.status !== HEALTH_STATUS.na) {
    return null;
  }
  if (hosting.healthError) {
    return `Check failed: ${hosting.healthError}`;
  }
  return hosting.isMonitored ? NOT_CHECKED_YET : NOT_MONITORED;
}

/** When the hosting check last ran for any of these rows, or null if it never has. */
export function hostingLastChecked(hosting: Hosting[]): string | null {
  const times = hosting.flatMap((row) => row.healthCheckedAt ?? []).sort();
  return times.at(-1) ?? null;
}

/** The sources the last check could not read, each named once. */
export function checkErrors(hosting: Hosting[]): string[] {
  return [
    ...new Set(hosting.flatMap((row) => row.healthError?.split("; ") ?? [])),
  ];
}

/** Every deduction behind a score, biggest first (the detail page shows the top three, then the rest on request). */
export function allDeductions(health: Health): Deduction[] {
  return Object.values(health.dimensions)
    .flatMap((dimension) => dimension?.deductions ?? [])
    .sort((a, b) => b.points - a.points);
}

export type CheckTimes = {dependencies: string | null; hosting: string | null};

/**
 * When each source last answered for this app, as ISO times, or null: dependencies
 * (a complete registry and advisory check) and hosting (a run with no error). A
 * failed run never counts as a check, and each source is shown on its own so an old
 * one is not hidden behind a fresh one (spec §8).
 */
export function checkTimes(app: Pick<AppDetail, 'dependencies' | 'hosting'>): CheckTimes {
  const latest = (times: string[]) => times.sort().at(-1) ?? null;
  return {
    dependencies: latest(app.dependencies.flatMap((dependency) => dependency.checkedAt ?? [])),
    hosting: latest(app.hosting.flatMap((row) => (row.healthError === null && row.healthCheckedAt ? [row.healthCheckedAt] : []))),
  };
}

/** "Dependencies 28 Nov 2026 · Hosting not checked yet", for what the app has recorded; "Not checked yet" when nothing is. */
export function checkTimesLine(app: Pick<AppDetail, 'dependencies' | 'hosting'>): string {
  const times = checkTimes(app);
  const parts = [
    ...(app.dependencies.length ? [`Dependencies ${times.dependencies ? formatDate(times.dependencies) : NOT_CHECKED_YET.toLowerCase()}`] : []),
    ...(app.hosting.length ? [`Hosting ${times.hosting ? formatDate(times.hosting) : NOT_CHECKED_YET.toLowerCase()}`] : []),
  ];
  return parts.join(' · ') || NOT_CHECKED_YET;
}

/**
 * What the score covers (spec §8 coverage): the checks behind it, the monitored ones
 * with nothing checked yet, and those not monitored at all.
 */
export function scoreBasis(health: Health): string {
  const dimensions = HEALTH_DIMENSIONS.map((dimension) => ({dimension, health: health.dimensions[dimension]}));
  const monitored = dimensions.filter((entry) => entry.health !== null);
  const checked = monitored.filter((entry) => entry.health?.status !== HEALTH_STATUS.na).map((entry) => DIMENSION_NAME[entry.dimension]);
  const unchecked = monitored.filter((entry) => entry.health?.status === HEALTH_STATUS.na).map((entry) => DIMENSION_NAME[entry.dimension]);
  const notMonitored = dimensions.filter((entry) => entry.health === null).map((entry) => DIMENSION_NAME[entry.dimension]);
  const basis = checked.length ? `Based on ${listWords(checked)} (${checked.length} of ${monitored.length} checks)` : '';
  const gaps = unchecked.length ? `${checked.length ? '; ' : ''}${checked.length ? listWords(unchecked) : capitalise(listWords(unchecked))} not checked yet` : '';
  const later = notMonitored.length ? ` ${capitalise(listWords(notMonitored))} checks are coming soon.` : '';
  return `${basis}${gaps}.${later}`;
}

const listWords = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : (words[0] ?? ''));
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
