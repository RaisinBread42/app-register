import {describe, expect, it} from 'vitest';
import {HOSTING_DIMENSION, HOSTING_HEALTH_STATUS, INCIDENT_IMPACT, INCIDENT_SCOPE} from '@/lib/constants';
import type {HostingIncident} from '@/lib/db/schema';
import {hostingDeductions, hostingHealth, hostingStatus, type HostingHealthRow} from './hosting-health';

const TODAY = '2026-11-22';

function row(patch: Partial<HostingHealthRow>): HostingHealthRow {
  return {provider: 'Azure', service: 'App Service', version: null, runtime: null, runtimeVersion: null, endOfSupportOn: null, incidents: [], ...patch};
}

function incident(patch: Partial<HostingIncident>): HostingIncident {
  return {
    title: 'Connection failures in Central US',
    impact: INCIDENT_IMPACT.major,
    scope: INCIDENT_SCOPE.service,
    url: 'https://status.example.test/incidents/1',
    startedAt: '2026-11-22T07:10:00.000Z',
    ...patch,
  };
}

const points = (rows: HostingHealthRow[]) => hostingDeductions(rows, TODAY).map((deduction) => deduction.points);

describe('hosting health', () => {
  // Acceptance criteria.

  it('hosting takes 25 points off past end of support, 12 within 90 days, 8 for an outage on the row’s service or region and 3 for any other notice', () => {
    const deductions = hostingDeductions(
      [
        row({service: 'Database for PostgreSQL', version: '12', endOfSupportOn: '2026-07-31'}),
        row({runtime: 'Node.js', runtimeVersion: '20', endOfSupportOn: '2027-02-04'}),
        row({service: 'Container Apps', incidents: [incident({})]}),
        row({
          provider: 'Cloudflare',
          service: 'CDN',
          incidents: [
            incident({title: 'BRU (Brussels) on 2026-11-23', impact: INCIDENT_IMPACT.maintenance, url: 'https://status.example.test/incidents/2'}),
            incident({title: 'Delays in dashboard analytics', impact: INCIDENT_IMPACT.minor, url: 'https://status.example.test/incidents/3'}),
            incident({title: 'Network issues in some regions', scope: INCIDENT_SCOPE.provider, url: 'https://status.example.test/incidents/4'}),
          ],
        }),
      ],
      TODAY,
    );

    expect(deductions).toEqual([
      {dimension: HOSTING_DIMENSION, label: 'Azure Database for PostgreSQL 12 is past end of support', detail: 'Support ended 2026-07-31', points: -25},
      {dimension: HOSTING_DIMENSION, label: 'Azure App Service (Node.js 20) nears end of support', detail: 'Support ends 2027-02-04', points: -12},
      {dimension: HOSTING_DIMENSION, label: 'Connection failures in Central US', detail: 'Azure outage', points: -8},
      {dimension: HOSTING_DIMENSION, label: 'BRU (Brussels) on 2026-11-23', detail: 'Cloudflare maintenance', points: -3},
      {dimension: HOSTING_DIMENSION, label: 'Delays in dashboard analytics', detail: 'Cloudflare notice', points: -3},
      {dimension: HOSTING_DIMENSION, label: 'Network issues in some regions', detail: 'Cloudflare notice', points: -3},
    ]);
  });

  it('hosting is critical past end of support or in an outage, attention for any other finding, ok when clear, and not applicable when nothing is monitored', () => {
    const status = (rows: HostingHealthRow[]) => hostingHealth(rows, TODAY).status;

    expect(status([row({endOfSupportOn: '2026-11-21'})])).toBe(HOSTING_HEALTH_STATUS.critical);
    expect(status([row({incidents: [incident({})]})])).toBe(HOSTING_HEALTH_STATUS.critical);
    expect(status([row({endOfSupportOn: '2027-01-15'})])).toBe(HOSTING_HEALTH_STATUS.attention);
    expect(status([row({incidents: [incident({impact: INCIDENT_IMPACT.minor})]})])).toBe(HOSTING_HEALTH_STATUS.attention);
    expect(status([row({endOfSupportOn: '2029-11-08'})])).toBe(HOSTING_HEALTH_STATUS.ok);
    expect(status([row({})])).toBe(HOSTING_HEALTH_STATUS.ok);
    expect(status([])).toBe(HOSTING_HEALTH_STATUS.na);
    // A server nobody's feed covers, with no date: there is nothing to judge.
    expect(status([row({provider: 'Office server room', service: 'Windows Server'})])).toBe(HOSTING_HEALTH_STATUS.na);
    expect(hostingStatus([])).toBe(HOSTING_HEALTH_STATUS.ok);
  });

  // Edge cases.

  it('end of support today or exactly 90 days away still counts as soon; yesterday is past and 91 days away is clear', () => {
    expect(points([row({endOfSupportOn: '2026-11-21'})])).toEqual([-25]);
    expect(points([row({endOfSupportOn: '2026-11-22'})])).toEqual([-12]);
    expect(points([row({endOfSupportOn: '2027-02-20'})])).toEqual([-12]);
    expect(points([row({endOfSupportOn: '2027-02-21'})])).toEqual([]);
  });

  it('an incident that reaches several rows counts once, at its heaviest', () => {
    const outage = incident({});
    const rows = [
      row({service: 'Storage', incidents: [incident({scope: INCIDENT_SCOPE.provider})]}),
      row({service: 'App Service', incidents: [outage]}),
      row({service: 'Container Apps', incidents: [outage]}),
    ];

    expect(points(rows)).toEqual([-8]);
  });
});
