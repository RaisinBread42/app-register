import {
  END_OF_SUPPORT_SOON_DAYS,
  HEALTH_DIMENSION,
  HEALTH_STATUS,
  HOSTING_POINTS,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  type HealthStatus,
} from '@/lib/constants';
import {findProvider} from '@/lib/hosting-catalog';
import {addDaysIso} from '@/lib/notice-alerts';
import type {Deduction} from './health';
import type {HostingIncident, HostingRecord} from './hosting-incidents';

/**
 * Hosting's share of an app's health: what the last hosting check stored on
 * each row, turned into point deductions and a status. Pure functions, no
 * database and no network.
 */

/** What scoring reads from a hosting row. */
export type HostingFacts = Pick<
  HostingRecord,
  'provider' | 'service' | 'version' | 'runtime' | 'runtimeVersion' | 'endOfSupportOn' | 'incidents' | 'healthError' | 'lastGoodCheckAt'
>;

/**
 * The points an app loses for its hosting on `today` (UTC YYYY-MM-DD), or null
 * when there is nothing to go on: it records no hosting, or no row is monitored
 * and checked (see `hostingStatus`).
 * - 25 per row past its end-of-support date;
 * - 12 per row whose end of support is today or within 90 days;
 * - 8 per active major incident the provider's feed ties to a row's service or region;
 * - 3 per other notice: maintenance, a minor incident, or a major incident
 *   that only names the provider.
 * An incident shared by several rows counts once, at its heaviest.
 */
export function hostingDeductions(rows: HostingFacts[], today: string): Deduction[] | null {
  if (rows.every((row) => hostingStatus(row, today) === HEALTH_STATUS.na)) {
    return null;
  }
  return [...rows.flatMap((row) => endOfSupportDeduction(row, today)), ...incidentDeductions(rows)];
}

/**
 * One hosting row's own status: `critical` when it is past end of support or in
 * an outage, `attention` for any other finding. Otherwise `ok`, but only when
 * the row is monitored and its last check read every source. A row whose latest
 * check failed after an earlier good one is `stale`; a row that is not monitored
 * or never had a good check is `na`.
 */
export function hostingStatus(row: HostingFacts, today: string): HealthStatus {
  const {incidents} = row;
  const [endOfSupport] = endOfSupportDeduction(row, today);
  if (endOfSupport?.points === HOSTING_POINTS.pastEndOfSupport || incidents.some(isOutage)) {
    return HEALTH_STATUS.critical;
  }
  if (endOfSupport || incidents.length > 0) {
    return HEALTH_STATUS.attention;
  }
  if (!isMonitored(row) || !row.lastGoodCheckAt) {
    return HEALTH_STATUS.na;
  }
  // The latest check failed: what the last good one read is kept, labelled stale, never ok (spec §8 check 23).
  return row.healthError ? HEALTH_STATUS.stale : HEALTH_STATUS.ok;
}

/** Monitored: the row has an end-of-support date, or its provider's status feed is watched. */
export function isMonitored(row: HostingFacts): boolean {
  return row.endOfSupportOn !== null || findProvider(row.provider)?.statusFeed !== undefined;
}

/** Only a major incident the feed ties to the row's own service or region counts as an outage. */
export function isOutage(incident: HostingIncident): boolean {
  return incident.impact === INCIDENT_IMPACT.major && incident.scope === INCIDENT_SCOPE.service;
}

function endOfSupportDeduction(row: HostingFacts, today: string): Deduction[] {
  if (!row.endOfSupportOn || row.endOfSupportOn > addDaysIso(today, END_OF_SUPPORT_SOON_DAYS)) {
    return [];
  }
  const isPast = row.endOfSupportOn < today;
  return [
    {
      dimension: HEALTH_DIMENSION.hosting,
      label: `${rowName(row)} ${isPast ? 'is past end of support' : 'nears end of support'}`,
      detail: `${isPast ? 'Support ended' : 'Support ends'} ${row.endOfSupportOn}`,
      points: isPast ? HOSTING_POINTS.pastEndOfSupport : HOSTING_POINTS.endOfSupportSoon,
    },
  ];
}

function incidentDeductions(rows: HostingFacts[]): Deduction[] {
  const byIncident = new Map<string, Deduction>();
  for (const row of rows) {
    for (const incident of row.incidents) {
      const key = `${incident.url} ${incident.title}`;
      const points = incidentPoints(incident);
      if (points > (byIncident.get(key)?.points ?? 0)) {
        byIncident.set(key, {
          dimension: HEALTH_DIMENSION.hosting,
          label: incident.title,
          detail: `${row.provider} ${incidentKind(incident)}`,
          points,
        });
      }
    }
  }
  return [...byIncident.values()];
}

function incidentPoints(incident: HostingIncident): number {
  return isOutage(incident) ? HOSTING_POINTS.outage : HOSTING_POINTS.notice;
}

function incidentKind(incident: HostingIncident): string {
  if (isOutage(incident)) {
    return 'outage';
  }
  return incident.impact === INCIDENT_IMPACT.maintenance ? 'maintenance' : 'notice';
}

/** "Azure Database for PostgreSQL 12", "Azure App Service (Node.js 18)". */
function rowName(row: HostingFacts): string {
  const service = [row.provider, row.service, row.version].filter(Boolean).join(' ');
  const runtime = [row.runtime, row.runtimeVersion].filter(Boolean).join(' ');
  return runtime ? `${service} (${runtime})` : service;
}
