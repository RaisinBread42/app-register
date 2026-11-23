import {asc, eq, type SQL} from 'drizzle-orm';
import {
  HOSTING_CHECK_ERROR_MAX_LENGTH,
  HOSTING_MAX_INCIDENTS,
  INCIDENT_IMPACTS,
  INCIDENT_SCOPES,
  INCIDENT_TITLE_MAX_LENGTH,
  type IncidentImpact,
  type IncidentScope,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {newId} from '@/lib/db/ids';
import {appHosting, hostingIncidents, type AppHostingRow} from '@/lib/db/schema';
import {findProvider} from '@/lib/hosting-catalog';
import {cleanText, isoTime, linkOnHostOf} from '@/lib/monitoring/feed-values';
import {isPlainObject} from './validation';

/**
 * Reads and writes the incidents of hosting rows: one row per incident in
 * `hosting_incidents`, in the order the check stored them.
 *
 * Incidents come from an outside feed, so nothing is trusted on the way in
 * (`normaliseIncidents`): an incident without a usable title, impact or scope
 * is left out, long text is cut, and the link is only kept when it is an
 * `https:` page on the status host the catalog lists for the row's provider.
 */

/** A provider incident or maintenance notice that reaches a hosting row, as the last check found it. */
export type HostingIncident = {
  title: string;
  impact: IncidentImpact;
  scope: IncidentScope;
  /** The provider's own status page for the incident; null when the feed gave no link on that host. */
  url: string | null;
  startedAt: string | null;
};

/** A hosting row with its incidents. */
export type HostingRecord = AppHostingRow & {incidents: HostingIncident[]};

type HostingKey = Pick<AppHostingRow, 'id' | 'workspaceId'>;

/** The hosting rows matching `where` (a filter on `app_hosting`) with their incidents, by provider then service. */
export async function loadHosting(db: AppDatabase, where: SQL | undefined): Promise<HostingRecord[]> {
  const rows = await db.select().from(appHosting).where(where).orderBy(asc(appHosting.provider), asc(appHosting.service));
  if (rows.length === 0) {
    return [];
  }
  const incidents = await incidentsByHosting(db, where);
  return rows.map((row) => ({...row, incidents: incidents.get(row.id) ?? []}));
}

/** Incidents of the hosting rows matching `where`, by hosting row id, each list in the order it was stored. */
async function incidentsByHosting(db: AppDatabase, where: SQL | undefined): Promise<Map<string, HostingIncident[]>> {
  const rows = await db
    .select({incident: hostingIncidents, provider: appHosting.provider})
    .from(hostingIncidents)
    .innerJoin(appHosting, eq(appHosting.id, hostingIncidents.hostingId))
    .where(where)
    .orderBy(asc(hostingIncidents.position));

  const byHosting = new Map<string, HostingIncident[]>();
  for (const {incident: row, provider} of rows) {
    const incidents = byHosting.get(row.hostingId) ?? [];
    byHosting.set(row.hostingId, incidents);
    incidents.push({
      title: row.title,
      impact: row.impact,
      scope: row.scope,
      // The link becomes an href, so it is checked against the provider's status host again on the way out.
      url: statusLink(provider, row.url),
      startedAt: isoTime(row.startedAt),
    });
  }
  return byHosting;
}

/**
 * Makes the incidents stored for a hosting row exactly `incidents` (already
 * through `normaliseIncidents`). Call it inside the transaction that changes the row.
 */
export async function replaceIncidents(tx: AppDatabase, hosting: HostingKey, incidents: HostingIncident[]): Promise<void> {
  const {id: hostingId, workspaceId} = hosting;
  await tx.delete(hostingIncidents).where(eq(hostingIncidents.hostingId, hostingId));
  if (incidents.length === 0) {
    return;
  }
  await tx.insert(hostingIncidents).values(
    incidents.map((incident, position) => ({
      id: newId(),
      workspaceId,
      hostingId,
      title: incident.title,
      impact: incident.impact,
      scope: incident.scope,
      url: incident.url,
      startedAt: incident.startedAt === null ? null : new Date(incident.startedAt),
      position,
    })),
  );
}

/** The incident as it may be stored and shown, or null when it is not usable. */
export function normaliseIncident(value: unknown, provider: string): HostingIncident | null {
  if (!isPlainObject(value) || typeof value.title !== 'string') {
    return null;
  }
  const title = cleanText(value.title, INCIDENT_TITLE_MAX_LENGTH);
  const {impact, scope} = value;
  if (title === '' || !isOneOf(INCIDENT_IMPACTS, impact) || !isOneOf(INCIDENT_SCOPES, scope)) {
    return null;
  }
  return {title, impact, scope, url: statusLink(provider, value.url), startedAt: isoTime(value.startedAt)};
}

/** What a check found, made safe to store: at most HOSTING_MAX_INCIDENTS, whatever is not a usable incident left out. */
export function normaliseIncidents(values: unknown[], provider: string): HostingIncident[] {
  return values
    .map((incident) => normaliseIncident(incident, provider))
    .filter((incident) => incident !== null)
    .slice(0, HOSTING_MAX_INCIDENTS);
}

/** A stored check error made safe to show: cut to its limit, or null when there is none. */
export function normaliseCheckError(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : cleanText(value, HOSTING_CHECK_ERROR_MAX_LENGTH);
}

/** `url` when it is an `https:` page on the status host the catalog lists for the provider; otherwise null. */
function statusLink(provider: string, url: unknown): string | null {
  const page = findProvider(provider)?.statusFeed?.page;
  return page ? linkOnHostOf(page, url) : null;
}

function isOneOf<T extends IncidentImpact | IncidentScope>(allowed: readonly T[], value: unknown): value is T {
  return (allowed as readonly unknown[]).includes(value);
}
