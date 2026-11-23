import {describe, expect, it} from 'vitest';
import {HEALTH_DIMENSION, HEALTH_STATUS, HOSTING_MAX_INCIDENTS, INCIDENT_IMPACT, INCIDENT_SCOPE, INCIDENT_TITLE_MAX_LENGTH} from '@/lib/constants';
import {statusPage} from '@/lib/monitoring/test/feeds';
import type {DependencyFacts} from './dependency-health';
import {appHealth} from './health';
import {hostingDeductions, hostingStatus, type HostingFacts} from './hosting-health';
import {normaliseIncidents, type HostingIncident} from './hosting-incidents';

const TODAY = '2026-11-22';
const CHECKED = new Date('2026-11-22T06:00:00Z');
const AZURE = statusPage('Azure');
const CLOUDFLARE = statusPage('Cloudflare');
const dimension = HEALTH_DIMENSION.hosting;

/** A hosting row whose last check read every source. */
function row(patch: Partial<HostingFacts>): HostingFacts {
  return {
    provider: 'Azure',
    service: 'App Service',
    version: null,
    runtime: null,
    runtimeVersion: null,
    endOfSupportOn: null,
    incidents: [],
    healthCheckedAt: CHECKED,
    healthError: null,
    ...patch,
  };
}

function incident(patch: Partial<HostingIncident>): HostingIncident {
  return {
    title: 'Connection failures in Central US',
    impact: INCIDENT_IMPACT.major,
    scope: INCIDENT_SCOPE.service,
    url: `${AZURE}/incident-1`,
    startedAt: '2026-11-22T07:10:00.000Z',
    ...patch,
  };
}

function dependency(overrides: Partial<DependencyFacts> = {}): DependencyFacts {
  return {
    name: 'quill-forms',
    currentVersion: '3.9.0',
    latestVersion: '5.0.2',
    vulnerabilities: [],
    advisories: [],
    isDev: false,
    checkedAt: CHECKED,
    checkError: null,
    ...overrides,
  };
}

const points = (rows: HostingFacts[]) => hostingDeductions(rows, TODAY)?.map((deduction) => deduction.points);
const health = (facts: {dependencies?: DependencyFacts[]; hosting?: HostingFacts[]}) =>
  appHealth({dependencies: [], hosting: [], today: TODAY, ...facts});

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
            incident({title: 'BRU (Brussels) on 2026-11-23', impact: INCIDENT_IMPACT.maintenance, url: `${CLOUDFLARE}/incidents/2`}),
            incident({title: 'Delays in dashboard analytics', impact: INCIDENT_IMPACT.minor, url: `${CLOUDFLARE}/incidents/3`}),
            incident({title: 'Network issues in some regions', scope: INCIDENT_SCOPE.provider, url: `${CLOUDFLARE}/incidents/4`}),
          ],
        }),
      ],
      TODAY,
    );

    expect(deductions).toEqual([
      {dimension, label: 'Azure Database for PostgreSQL 12 is past end of support', detail: 'Support ended 2026-07-31', points: 25},
      {dimension, label: 'Azure App Service (Node.js 20) nears end of support', detail: 'Support ends 2027-02-04', points: 12},
      {dimension, label: 'Connection failures in Central US', detail: 'Azure outage', points: 8},
      {dimension, label: 'BRU (Brussels) on 2026-11-23', detail: 'Cloudflare maintenance', points: 3},
      {dimension, label: 'Delays in dashboard analytics', detail: 'Cloudflare notice', points: 3},
      {dimension, label: 'Network issues in some regions', detail: 'Cloudflare notice', points: 3},
    ]);
  });

  it('a hosting row is critical past end of support or in an outage, attention for any other finding, and ok when its check found nothing', () => {
    const status = (patch: Partial<HostingFacts>) => hostingStatus(row(patch), TODAY);

    expect(status({endOfSupportOn: '2026-11-21'})).toBe(HEALTH_STATUS.critical);
    expect(status({incidents: [incident({})]})).toBe(HEALTH_STATUS.critical);
    expect(status({endOfSupportOn: '2027-01-15'})).toBe(HEALTH_STATUS.attention);
    expect(status({incidents: [incident({impact: INCIDENT_IMPACT.minor})]})).toBe(HEALTH_STATUS.attention);
    expect(status({endOfSupportOn: '2029-11-08'})).toBe(HEALTH_STATUS.ok);
    expect(status({})).toBe(HEALTH_STATUS.ok);
  });

  it('hosting deductions count in the one health score next to dependency deductions, and health.dimensions.hosting carries its own status and deductions, largest first', () => {
    const scored = health({
      dependencies: [dependency()],
      hosting: [row({endOfSupportOn: '2027-01-15'}), row({service: 'Storage', incidents: [incident({})]})],
    });

    // 100 − 12 (end of support soon) − 8 (outage) − 3 (a dependency a major version behind).
    expect(scored.score).toBe(77);
    expect(scored.status).toBe(HEALTH_STATUS.critical);
    // Each dimension's status follows the points it lost on its own: 20 is attention, 3 is still ok.
    expect(scored.dimensions.hosting).toEqual({
      status: HEALTH_STATUS.attention,
      deductions: [
        {dimension, label: 'Azure App Service nears end of support', detail: 'Support ends 2027-01-15', points: 12},
        {dimension, label: 'Connection failures in Central US', detail: 'Azure outage', points: 8},
      ],
    });
    expect(scored.dimensions.dependencies).toMatchObject({status: HEALTH_STATUS.ok, deductions: [{points: 3}]});
    expect([scored.dimensions.licence, scored.dimensions.pricing]).toEqual([null, null]);
  });

  it('an app with no monitored hosting has hosting status na and it contributes nothing to the score', () => {
    const unmonitored = [row({provider: 'Office server room', service: 'Windows Server', healthCheckedAt: null})];

    for (const hosting of [[], unmonitored]) {
      const scored = health({dependencies: [dependency()], hosting});
      expect(scored.dimensions.hosting).toEqual({status: HEALTH_STATUS.na, deductions: []});
      expect(scored.score).toBe(97);
    }
    expect(hostingDeductions([], TODAY)).toBeNull();
  });

  it('an app with neither dependencies nor monitored hosting to go on has no score', () => {
    const scored = health({hosting: [row({provider: 'Office server room', service: 'Windows Server'})]});

    expect(scored).toMatchObject({score: null, status: HEALTH_STATUS.na});
    expect(scored.dimensions.dependencies).toEqual({status: HEALTH_STATUS.na, deductions: []});
    expect(scored.dimensions.hosting).toEqual({status: HEALTH_STATUS.na, deductions: []});
  });

  it('hosting alone gives a score: an app with clear, checked hosting and no dependencies scores 100', () => {
    const scored = health({hosting: [row({})]});

    expect(scored).toMatchObject({score: 100, status: HEALTH_STATUS.ok});
    expect(scored.dimensions.hosting).toEqual({status: HEALTH_STATUS.ok, deductions: []});
  });

  it('a hosting row whose check never completed or last failed is na, never ok, and an app with only such rows has hosting status na', () => {
    const neverChecked = row({healthCheckedAt: null});
    const failed = row({service: 'Storage', healthError: 'Azure status could not be reached (HTTP 503)'});

    expect(hostingStatus(neverChecked, TODAY)).toBe(HEALTH_STATUS.na);
    expect(hostingStatus(failed, TODAY)).toBe(HEALTH_STATUS.na);
    expect(health({hosting: [neverChecked, failed]})).toMatchObject({score: null, dimensions: {hosting: {status: HEALTH_STATUS.na, deductions: []}}});
    // What an earlier check found still counts while the latest one failed.
    const failedWithFinding = row({healthError: 'Azure status could not be reached (HTTP 503)', endOfSupportOn: '2026-07-31'});
    expect(hostingStatus(failedWithFinding, TODAY)).toBe(HEALTH_STATUS.critical);
    expect(points([failedWithFinding])).toEqual([25]);
  });

  // Edge cases.

  it('end of support today or exactly 90 days away still counts as soon; yesterday is past and 91 days away is clear', () => {
    expect(points([row({endOfSupportOn: '2026-11-21'})])).toEqual([25]);
    expect(points([row({endOfSupportOn: '2026-11-22'})])).toEqual([12]);
    expect(points([row({endOfSupportOn: '2027-02-20'})])).toEqual([12]);
    expect(points([row({endOfSupportOn: '2027-02-21'})])).toEqual([]);
  });

  it('an incident that reaches several rows counts once, at its heaviest', () => {
    const outage = incident({});
    const rows = [
      row({service: 'Storage', incidents: [incident({scope: INCIDENT_SCOPE.provider})]}),
      row({service: 'App Service', incidents: [outage]}),
      row({service: 'Container Apps', incidents: [outage]}),
    ];

    expect(points(rows)).toEqual([8]);
  });

  // Security: what a feed stored is never trusted when it is read back.

  it('what a check found that is not a usable incident is left out before anything is stored, and the rest still count', () => {
    const found = [
      incident({}),
      null,
      'outage',
      {title: 42, impact: INCIDENT_IMPACT.major, scope: INCIDENT_SCOPE.service},
      {title: 'No impact', scope: INCIDENT_SCOPE.service},
      {title: 'Made-up impact', impact: 'apocalyptic', scope: INCIDENT_SCOPE.service},
      {title: '   ', impact: INCIDENT_IMPACT.major, scope: INCIDENT_SCOPE.service},
    ];

    const usable = normaliseIncidents(found, 'Azure');
    expect(usable).toEqual([incident({})]);
    expect(points([row({incidents: usable})])).toEqual([8]);
  });

  it('an incident link is kept only when it is an https page on the provider’s own status host; any other link is dropped and the incident stays', () => {
    const link = (url: unknown, provider = 'Azure') => normaliseIncidents([{...incident({}), url}], provider)[0].url;

    expect(link(`${AZURE}/incident-1`)).toBe(`${AZURE}/incident-1`);
    expect(link('https://www.cloudflarestatus.com/incidents/abc', 'Cloudflare')).toBe('https://www.cloudflarestatus.com/incidents/abc');
    for (const url of [
      'https://evil.example/azure.status.microsoft',
      'http://azure.status.microsoft/en-us/status',
      'javascript:alert(1)',
      'https://azure.status.microsoft@evil.example/',
      'https://user:secret@azure.status.microsoft/',
      'https://azure.status.microsoft.evil.example/',
      'https://azure.status.microsoft:8443/',
      '//evil.example',
      'not a url',
      `${AZURE}/${'x'.repeat(600)}`,
      42,
      null,
    ]) {
      expect(link(url), String(url)).toBeNull();
    }
    // Another provider's status host is not this provider's.
    expect(link('https://www.cloudflarestatus.com/incidents/abc')).toBeNull();
    // A provider with no watched status page has no host a link could be on.
    expect(link(`${AZURE}/incident-1`, 'Office server room')).toBeNull();
  });

  it('stored incidents are cut to their limits: a long title is cut, a broken time becomes null, and only the first 20 are kept', () => {
    const many = Array.from({length: HOSTING_MAX_INCIDENTS + 5}, (_, index) => incident({title: `Incident ${index}`}));
    expect(normaliseIncidents(many, 'Azure')).toHaveLength(HOSTING_MAX_INCIDENTS);

    const [long] = normaliseIncidents([incident({title: `\u0000Outage\n${'x'.repeat(500)}`, startedAt: 'yesterday-ish'})], 'Azure');
    expect(long.title).toHaveLength(INCIDENT_TITLE_MAX_LENGTH);
    expect(long.title.startsWith('Outage x')).toBe(true);
    expect(long.startedAt).toBeNull();
    // A character cut in half would be refused by the database.
    const [emoji] = normaliseIncidents([incident({title: `${'x'.repeat(INCIDENT_TITLE_MAX_LENGTH - 1)}😀`})], 'Azure');
    expect(emoji.title.isWellFormed()).toBe(true);
  });
});
