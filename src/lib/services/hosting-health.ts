import {
  END_OF_SUPPORT_SOON_DAYS,
  HOSTING_CRITICAL_POINTS,
  HOSTING_DIMENSION,
  HOSTING_HEALTH_STATUS,
  HOSTING_POINTS,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  type HostingHealthStatus,
} from '@/lib/constants';
import type {HostingIncident} from '@/lib/db/schema';
import {findProvider} from '@/lib/hosting-catalog';
import {addDaysIso} from '@/lib/notice-alerts';

/**
 * Hosting's share of an app's health: what the last hosting check stored on
 * each row, turned into point deductions and a status pill. Pure functions,
 * no database and no network.
 */

/**
 * One finding that takes points off the 100-point health score (`points` is negative).
 * TODO after `claude/dependency-health` merges: import this type from `./health`
 * instead; the shape is the same.
 */
export type Deduction = {
  dimension: string;
  label: string;
  detail: string;
  points: number;
};

/** The parts of a hosting row the rules read. */
export type HostingHealthRow = {
  provider: string;
  service: string;
  version: string | null;
  runtime: string | null;
  runtimeVersion: string | null;
  endOfSupportOn: string | null;
  incidents: HostingIncident[];
};

export type HostingHealth = {status: HostingHealthStatus; deductions: Deduction[]};

/**
 * Deductions for an app's hosting rows on `today` (UTC YYYY-MM-DD):
 * - −25 per row past its end-of-support date;
 * - −12 per row whose end of support is today or within 90 days;
 * - −8 per active major incident the provider's feed ties to a row's service or region;
 * - −3 per other notice: maintenance, a minor incident, or a major incident
 *   that only names the provider.
 * An incident shared by several rows counts once, at its heaviest.
 */
export function hostingDeductions(rows: HostingHealthRow[], today: string): Deduction[] {
  return [...rows.flatMap((row) => endOfSupportDeduction(row, today)), ...incidentDeductions(rows)];
}

/** `critical` when a row is past end of support or in an outage, `attention` for any other finding, else `ok`. */
export function hostingStatus(deductions: Deduction[]): Exclude<HostingHealthStatus, typeof HOSTING_HEALTH_STATUS.na> {
  if (deductions.some((deduction) => HOSTING_CRITICAL_POINTS.includes(deduction.points))) {
    return HOSTING_HEALTH_STATUS.critical;
  }
  return deductions.length > 0 ? HOSTING_HEALTH_STATUS.attention : HOSTING_HEALTH_STATUS.ok;
}

/**
 * An app's hosting status and deductions. `na` when there is nothing to judge:
 * no hosting rows, or none with an end-of-support date or a provider whose
 * status feed is watched.
 */
export function hostingHealth(rows: HostingHealthRow[], today: string): HostingHealth {
  const deductions = hostingDeductions(rows, today);
  const isMonitored = rows.some((row) => row.endOfSupportOn !== null || findProvider(row.provider)?.statusFeed);
  return {
    status: isMonitored ? hostingStatus(deductions) : HOSTING_HEALTH_STATUS.na,
    deductions,
  };
}

function endOfSupportDeduction(row: HostingHealthRow, today: string): Deduction[] {
  if (!row.endOfSupportOn || row.endOfSupportOn > addDaysIso(today, END_OF_SUPPORT_SOON_DAYS)) {
    return [];
  }
  const isPast = row.endOfSupportOn < today;
  return [
    {
      dimension: HOSTING_DIMENSION,
      label: `${rowName(row)} ${isPast ? 'is past end of support' : 'nears end of support'}`,
      detail: `${isPast ? 'Support ended' : 'Support ends'} ${row.endOfSupportOn}`,
      points: isPast ? HOSTING_POINTS.pastEndOfSupport : HOSTING_POINTS.endOfSupportSoon,
    },
  ];
}

function incidentDeductions(rows: HostingHealthRow[]): Deduction[] {
  const byIncident = new Map<string, Deduction>();
  for (const row of rows) {
    for (const incident of row.incidents) {
      const key = `${incident.url} ${incident.title}`;
      const points = incidentPoints(incident);
      if (points < (byIncident.get(key)?.points ?? 0)) {
        byIncident.set(key, {
          dimension: HOSTING_DIMENSION,
          label: incident.title,
          detail: `${row.provider} ${incidentKind(incident)}`,
          points,
        });
      }
    }
  }
  return [...byIncident.values()];
}

/** Only a major incident the feed ties to the row's own service or region counts as an outage. */
export function isOutage(incident: HostingIncident): boolean {
  return incident.impact === INCIDENT_IMPACT.major && incident.scope === INCIDENT_SCOPE.service;
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
function rowName(row: HostingHealthRow): string {
  const service = [row.provider, row.service, row.version].filter(Boolean).join(' ');
  const runtime = [row.runtime, row.runtimeVersion].filter(Boolean).join(' ');
  return runtime ? `${service} (${runtime})` : service;
}
