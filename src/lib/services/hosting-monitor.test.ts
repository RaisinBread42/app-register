import {beforeEach, describe, expect, it} from 'vitest';
import {
  END_OF_SUPPORT_SOURCE,
  HEALTH_STATUS,
  HOSTING_MAX_INCIDENTS,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  INCIDENT_TITLE_MAX_LENGTH,
} from '@/lib/constants';
import {newId} from '@/lib/db/ids';
import {workspaces} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createFetchText, type FetchText} from '@/lib/monitoring/http';
import {
  ALL_CLEAR,
  FEED_URL,
  NODEJS,
  POSTGRES_ON_AZURE,
  awsCurrentEvents,
  azureStatusRss,
  endOfLifeDocument,
  endOfLifeUrlFor,
  fakeFeeds,
  googleCloudIncidents,
  statusPage,
  statuspageSummary,
} from '@/lib/monitoring/test/feeds';
import {archiveApp, createApp} from './apps';
import {addHosting, listHosting, updateHosting, type HostingInput, type HostingView} from './hosting';
import {refreshHostingHealth, refreshWorkspaceHostingHealth} from './hosting-monitor';
import type {Fetch} from './package-sources';
import {createPerson} from './people';

const AZURE_POSTGRES = endOfLifeUrlFor('azure-database-for-postgresql');
const NODE = endOfLifeUrlFor('nodejs');
const NO_AZURE_INCIDENTS = azureStatusRss([]);

describe('hosting check', () => {
  let t: TestDb;
  let appId: string;
  let ownerId: string;
  let backupOwnerId: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'})).id;
    backupOwnerId = (await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'})).id;
    appId = await newApp('Customer Portal');
  });

  async function newApp(name: string, workspaceId = t.workspaceId, owner = ownerId, backup = backupOwnerId) {
    return (await createApp(t.db, workspaceId, {name, kind: 'vendor_service', ownerId: owner, backupOwnerId: backup})).id;
  }

  const add = (input: HostingInput, app = appId) => addHosting(t.db, t.workspaceId, app, input);
  const byService = (rows: HostingView[], service: string) => rows.find((row) => row.service === service)!;
  const scopes = (row: HostingView) => row.incidents.map((incident) => [incident.impact, incident.scope]);

  // Acceptance criteria.

  it('a hosting row’s end-of-support date is looked up from its service version or its runtime version, asking each source once', async () => {
    await add({provider: 'Azure', service: 'Database for PostgreSQL', region: 'centralus', version: '12'});
    await add({provider: 'Azure', service: 'App Service', runtime: 'Node.js', runtimeVersion: '22'});
    await add({provider: 'Azure', service: 'Storage'});
    const feeds = fakeFeeds({[AZURE_POSTGRES]: POSTGRES_ON_AZURE, [NODE]: NODEJS, [FEED_URL.azure]: NO_AZURE_INCIDENTS});
    const now = new Date('2026-11-22T09:00:00Z');

    const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: feeds.fetchText, now});

    expect(byService(rows, 'Database for PostgreSQL')).toMatchObject({
      endOfSupportOn: '2026-07-31',
      endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate,
      healthCheckedAt: now,
      healthError: null,
    });
    expect(byService(rows, 'App Service')).toMatchObject({endOfSupportOn: '2027-04-30', endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate});
    expect(byService(rows, 'Storage')).toMatchObject({endOfSupportOn: null, endOfSupportSource: null, healthCheckedAt: now});
    // Three Azure rows share one status feed request.
    expect([...feeds.requested].sort()).toEqual([AZURE_POSTGRES, NODE, FEED_URL.azure].sort());
  });

  it('an end-of-support date typed by hand is never overwritten by a check, and clearing it hands the date back to the check', async () => {
    const database = await add({provider: 'Azure', service: 'Database for PostgreSQL', version: '12', endOfSupportOn: '2030-01-01'});
    const {fetchText} = fakeFeeds({[AZURE_POSTGRES]: POSTGRES_ON_AZURE, [FEED_URL.azure]: NO_AZURE_INCIDENTS});
    expect(database.endOfSupportSource).toBe(END_OF_SUPPORT_SOURCE.manual);

    const [kept] = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText});
    expect(kept).toMatchObject({endOfSupportOn: '2030-01-01', endOfSupportSource: END_OF_SUPPORT_SOURCE.manual});

    await updateHosting(t.db, t.workspaceId, appId, database.id, {endOfSupportOn: null});
    const [lookedUp] = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText});
    expect(lookedUp).toMatchObject({endOfSupportOn: '2026-07-31', endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate});

    // An edit that leaves the date out (as the edit form does), or sends null, leaves a looked-up date alone.
    const edited = await updateHosting(t.db, t.workspaceId, appId, database.id, {region: 'centralus'});
    expect(edited).toMatchObject({endOfSupportOn: '2026-07-31', endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate});
    const nulled = await updateHosting(t.db, t.workspaceId, appId, database.id, {endOfSupportOn: null});
    expect(nulled).toMatchObject({endOfSupportOn: '2026-07-31', endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate});
    // A looked-up date does not outlive the version it was for.
    const upgraded = await updateHosting(t.db, t.workspaceId, appId, database.id, {version: '16'});
    expect(upgraded).toMatchObject({endOfSupportOn: null, endOfSupportSource: null});
  });

  it('an open provider incident reaches the rows its feed ties to it: by service or region, as a provider notice when the feed cannot tell, and not at all when it names something else', async () => {
    await add({provider: 'Cloudflare', service: 'Workers'});
    await add({provider: 'Cloudflare', service: 'CDN', region: 'BRU'});
    await add({provider: 'Cloudflare', service: 'DNS'});
    await add({provider: 'Cloudflare', service: 'Edge thing we named ourselves'});
    const {fetchText} = fakeFeeds({
      [FEED_URL.cloudflare]: statuspageSummary(
        [
          {name: 'Workers scripts failing to deploy', impact: 'major', components: ['Workers', 'Queues']},
          {name: 'Delays in Stream analytics', impact: 'minor', components: ['Stream']},
        ],
        [{name: 'BRU (Brussels) on 2026-11-23', impact: 'maintenance', components: ['Brussels, Belgium - (BRU)'], scheduledFor: '2026-11-23T02:00:00.000Z'}],
      ),
    });

    const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText});

    expect(byService(rows, 'Workers').incidents).toEqual([
      {
        title: 'Workers scripts failing to deploy',
        impact: INCIDENT_IMPACT.major,
        scope: INCIDENT_SCOPE.service,
        // Rebuilt from the incident id on the provider's own status host, not the feed's short link.
        url: 'https://www.cloudflarestatus.com/incidents/inc0',
        startedAt: '2026-11-20T08:15:00.000Z',
      },
    ]);
    expect(byService(rows, 'CDN').incidents).toMatchObject([
      {title: 'BRU (Brussels) on 2026-11-23', impact: INCIDENT_IMPACT.maintenance, scope: INCIDENT_SCOPE.service, startedAt: '2026-11-23T02:00:00.000Z'},
    ]);
    expect(byService(rows, 'DNS').incidents).toEqual([]);
    expect(scopes(byService(rows, 'Edge thing we named ourselves'))).toEqual([[INCIDENT_IMPACT.major, INCIDENT_SCOPE.provider]]);
  });

  it('one failing source is named on the row and neither fails the check nor wipes what earlier checks found', async () => {
    await add({provider: 'Cloudflare', service: 'Workers'});
    await add({provider: 'Azure', service: 'Database for PostgreSQL', version: '12'});
    await add({provider: 'Vercel', service: 'Hosting', runtime: 'Node.js', runtimeVersion: '18'});
    const outage = statuspageSummary([{name: 'Workers scripts failing to deploy', impact: 'major', components: ['Workers']}]);
    const healthy = {[FEED_URL.cloudflare]: outage, [FEED_URL.azure]: NO_AZURE_INCIDENTS, [FEED_URL.vercel]: ALL_CLEAR, [AZURE_POSTGRES]: POSTGRES_ON_AZURE, [NODE]: NODEJS};
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds(healthy).fetchText});

    const broken = fakeFeeds({
      ...healthy,
      [FEED_URL.cloudflare]: new Error('HTTP 503'),
      [AZURE_POSTGRES]: '<html>Service unavailable</html>',
    });
    const summary = await refreshWorkspaceHostingHealth(t.db, t.workspaceId, {fetchText: broken.fetchText});

    const rows = await listHosting(t.db, t.workspaceId, appId);
    expect(byService(rows, 'Workers')).toMatchObject({
      incidents: [{title: 'Workers scripts failing to deploy'}],
      healthError: 'Cloudflare status could not be reached (HTTP 503)',
    });
    expect(byService(rows, 'Database for PostgreSQL')).toMatchObject({
      endOfSupportOn: '2026-07-31',
      healthError: 'endoflife.date sent an unexpected format',
    });
    expect(byService(rows, 'Hosting')).toMatchObject({endOfSupportOn: '2025-04-30', healthError: null});
    expect(summary).toEqual({
      apps: 1,
      hosting: 3,
      failedSources: expect.arrayContaining(['Cloudflare status could not be reached (HTTP 503)', 'endoflife.date sent an unexpected format']),
    });
  });

  // Edge cases.

  it('AWS, Google Cloud and Azure feeds tie an incident to a row only when they name its service and do not name another region', async () => {
    await add({provider: 'AWS', service: 'EC2', region: 'me-central-1'});
    await add({provider: 'AWS', service: 'EC2', region: 'eu-west-1'});
    await add({provider: 'Google Cloud', service: 'Cloud Run', region: 'us-central1'});
    await add({provider: 'Google Cloud', service: 'Cloud Storage', region: 'us-central1'});
    await add({provider: 'Azure', service: 'Database for PostgreSQL', region: 'centralus'});
    await add({provider: 'Azure', service: 'Storage', region: 'westeurope'});
    const {fetchText} = fakeFeeds({
      [FEED_URL.aws]: awsCurrentEvents([{region: 'me-central-1', status: '3', service: 'Multiple services', impacted: ['Amazon Elastic Compute Cloud', 'AWS Lambda']}]),
      [FEED_URL.googleCloud]: googleCloudIncidents([
        {description: 'Cloud Run deployments failing in us-central1', impact: 'SERVICE_DISRUPTION', products: ['Cloud Run'], locations: ['us-central1']},
        {description: 'Resolved last month', impact: 'SERVICE_OUTAGE', products: ['Cloud Run', 'Google Cloud Storage'], locations: [], end: '2026-10-20T12:08:00+00:00'},
      ]),
      [FEED_URL.azure]: azureStatusRss([{title: 'Azure Database for PostgreSQL - Central US - Investigating', description: 'Customers in Central US may see connection failures.'}]),
    });

    const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText});
    const found = Object.fromEntries(rows.map((row) => [`${row.service} ${row.region}`, scopes(row)]));

    expect(found).toEqual({
      'EC2 me-central-1': [[INCIDENT_IMPACT.major, INCIDENT_SCOPE.service]],
      'EC2 eu-west-1': [],
      'Cloud Run us-central1': [[INCIDENT_IMPACT.major, INCIDENT_SCOPE.service]],
      'Cloud Storage us-central1': [],
      'Database for PostgreSQL centralus': [[INCIDENT_IMPACT.major, INCIDENT_SCOPE.service]],
      // Azure's feed is free text: it cannot rule a row out, so the rest of Azure gets a provider notice.
      'Storage westeurope': [[INCIDENT_IMPACT.major, INCIDENT_SCOPE.provider]],
    });
    expect(byService(rows, 'Cloud Run').incidents[0].url).toBe('https://status.cloud.google.com/incidents/g0');
  });

  it('a version is matched the way people type it, and an unknown version or unlisted service leaves the date empty', async () => {
    await add({provider: 'Azure', service: 'Database for PostgreSQL', version: 'v14.9'});
    await add({provider: 'Azure', service: 'SQL Server on Virtual Machines', version: '2022'});
    await add({provider: 'Azure', service: 'App Service', runtime: 'nodejs', runtimeVersion: '7'});
    await add({provider: 'Hetzner', service: 'PostgreSQL', version: '12'});
    const sqlServer = endOfLifeDocument([{name: '16.0', label: "2022 'Dallas'", eolFrom: '2033-01-11'}, {name: '15.0', label: "2019 'Aris/Seattle'", eolFrom: '2030-01-08'}]);
    const feeds = fakeFeeds({[AZURE_POSTGRES]: POSTGRES_ON_AZURE, [endOfLifeUrlFor('mssqlserver')]: sqlServer, [NODE]: NODEJS, [FEED_URL.azure]: NO_AZURE_INCIDENTS});

    const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: feeds.fetchText});

    expect(Object.fromEntries(rows.map((row) => [row.service, row.endOfSupportOn]))).toEqual({
      'Database for PostgreSQL': '2027-01-31',
      'SQL Server on Virtual Machines': '2033-01-11',
      'App Service': null,
      PostgreSQL: null,
    });
    // An unlisted provider is never looked up anywhere.
    expect(byService(rows, 'PostgreSQL')).toMatchObject({healthError: null, incidents: []});
    expect(feeds.requested).toHaveLength(4);
  });

  // Security.

  it('a check only touches active apps in its own workspace, and an app in another workspace is not found', async () => {
    const otherWorkspace = newId();
    await t.db.insert(workspaces).values({id: otherWorkspace, name: 'Fabrikam', slug: 'fabrikam'});
    const cy = await createPerson(t.db, otherWorkspace, {name: 'Cy Other', email: 'cy@example.test'});
    const di = await createPerson(t.db, otherWorkspace, {name: 'Di Other', email: 'di@example.test'});
    const theirApp = await newApp('Fabrikam Vault', otherWorkspace, cy.id, di.id);
    await addHosting(t.db, otherWorkspace, theirApp, {provider: 'Vercel', service: 'Hosting'});
    const retired = await newApp('Retired Wiki');
    await add({provider: 'Vercel', service: 'Hosting'}, retired);
    await archiveApp(t.db, t.workspaceId, retired);
    await add({provider: 'Vercel', service: 'Hosting'});
    const {fetchText} = fakeFeeds({[FEED_URL.vercel]: ALL_CLEAR});

    const summary = await refreshWorkspaceHostingHealth(t.db, t.workspaceId, {fetchText});

    expect(summary).toEqual({apps: 1, hosting: 1, failedSources: []});
    expect((await listHosting(t.db, otherWorkspace, theirApp))[0].healthCheckedAt).toBeNull();
    expect((await listHosting(t.db, t.workspaceId, retired))[0].healthCheckedAt).toBeNull();
    await expect(refreshHostingHealth(t.db, t.workspaceId, theirApp, {fetchText})).rejects.toThrow('App not found');
  });

  // The same rules as the dependency check.

  it('a check stores its answer only while the row still is what was checked: an edit made while the sources were being asked wins', async () => {
    const database = await add({provider: 'Azure', service: 'Database for PostgreSQL', version: '12'});
    const site = await add({provider: 'Vercel', service: 'Hosting', runtime: 'Node.js', runtimeVersion: '18'});
    const feeds = fakeFeeds({[AZURE_POSTGRES]: POSTGRES_ON_AZURE, [NODE]: NODEJS, [FEED_URL.azure]: NO_AZURE_INCIDENTS, [FEED_URL.vercel]: ALL_CLEAR});
    let edited = false;
    const fetchText: FetchText = async (url, signal) => {
      if (!edited) {
        edited = true;
        // The upgrade lands while the check is in flight.
        await updateHosting(t.db, t.workspaceId, appId, database.id, {version: '16'});
      }
      return feeds.fetchText(url, signal);
    };

    const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText});

    // The answer was about version 12: nothing of it is stored on what is now version 16.
    expect(byService(rows, 'Database for PostgreSQL')).toMatchObject({version: '16', endOfSupportOn: null, healthCheckedAt: null, status: HEALTH_STATUS.na});
    expect(byService(rows, 'Hosting')).toMatchObject({id: site.id, endOfSupportOn: '2025-04-30'});
    expect(byService(rows, 'Hosting').healthCheckedAt).not.toBeNull();
  });

  it('a date set by hand while a check is in flight is not overwritten by what the check looked up', async () => {
    const database = await add({provider: 'Azure', service: 'Database for PostgreSQL', version: '12'});
    const feeds = fakeFeeds({[AZURE_POSTGRES]: POSTGRES_ON_AZURE, [FEED_URL.azure]: NO_AZURE_INCIDENTS});
    let edited = false;
    const fetchText: FetchText = async (url, signal) => {
      if (!edited) {
        edited = true;
        await updateHosting(t.db, t.workspaceId, appId, database.id, {endOfSupportOn: '2030-01-01'});
      }
      return feeds.fetchText(url, signal);
    };

    const [row] = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText});

    expect(row).toMatchObject({endOfSupportOn: '2030-01-01', endOfSupportSource: END_OF_SUPPORT_SOURCE.manual});
  });

  it('changing a row’s provider, service, region, version or runtime clears what the last check found, because it was about something else', async () => {
    const worker = await add({provider: 'Cloudflare', service: 'Workers', region: 'BRU'});
    const outage = statuspageSummary([{name: 'Workers scripts failing to deploy', impact: 'major', components: ['Workers']}]);
    const check = () => refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.cloudflare]: outage}).fetchText});
    const edits: Partial<HostingInput>[] = [{region: 'AMS'}, {service: 'Pages'}, {version: '3'}, {runtime: 'Node.js', runtimeVersion: '22'}, {provider: 'Netlify', service: 'Functions'}];

    for (const edit of edits) {
      const [checked] = await check();
      expect(checked.healthCheckedAt, JSON.stringify(edit)).not.toBeNull();
      const after = await updateHosting(t.db, t.workspaceId, appId, worker.id, edit);
      expect(after, JSON.stringify(edit)).toMatchObject({incidents: [], healthCheckedAt: null, healthError: null, status: HEALTH_STATUS.na});
    }
    // An edit that changes none of them keeps what the check found.
    await updateHosting(t.db, t.workspaceId, appId, worker.id, {provider: 'Cloudflare', service: 'Workers'});
    const [found] = await check();
    const same = await updateHosting(t.db, t.workspaceId, appId, worker.id, {endOfSupportOn: null});
    expect(same.incidents).toEqual(found.incidents);
    expect(same.healthCheckedAt).toEqual(found.healthCheckedAt);
  });

  it('an app archived while the workspace refresh runs is skipped: nothing is stored on its rows, it is not counted, and the other apps are still checked', async () => {
    const second = await newApp('Tally Billing');
    await add({provider: 'Vercel', service: 'Hosting'});
    await add({provider: 'Vercel', service: 'Blob'}, second);
    const feeds = fakeFeeds({[FEED_URL.vercel]: ALL_CLEAR});
    let archived = false;
    const fetchText: FetchText = async (url, signal) => {
      if (!archived) {
        archived = true;
        await archiveApp(t.db, t.workspaceId, second);
      }
      return feeds.fetchText(url, signal);
    };

    const summary = await refreshWorkspaceHostingHealth(t.db, t.workspaceId, {fetchText});

    expect(summary).toEqual({apps: 1, hosting: 1, failedSources: []});
    expect((await listHosting(t.db, t.workspaceId, second))[0]).toMatchObject({healthCheckedAt: null, healthError: null});
    expect((await listHosting(t.db, t.workspaceId, appId))[0].healthCheckedAt).not.toBeNull();
  });

  it('a check that runs out of time leaves the rows it could not finish unchecked for the next refresh, and never shows them as ok', async () => {
    await add({provider: 'Vercel', service: 'Hosting', runtime: 'Node.js', runtimeVersion: '24'});
    await add({provider: 'Office server room', service: 'Windows Server', endOfSupportOn: '2031-10-14'});
    const feeds = fakeFeeds({[FEED_URL.vercel]: ALL_CLEAR, [NODE]: NODEJS});
    /** Answers only when the caller gives up, the way `fetch` does when its signal aborts. */
    const stalled: FetchText = (_url, signal) =>
      new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));

    const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: stalled, budgetMs: 20});

    expect(byService(rows, 'Hosting')).toMatchObject({healthCheckedAt: null, healthError: null, endOfSupportOn: null, status: HEALTH_STATUS.na});
    // A row that needs no outside source is still checked.
    expect(byService(rows, 'Windows Server')).toMatchObject({status: HEALTH_STATUS.ok, healthError: null});

    const later = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: feeds.fetchText});
    expect(byService(later, 'Hosting')).toMatchObject({endOfSupportOn: '2028-04-30', status: HEALTH_STATUS.ok});
  });

  it('checking only the row that was just saved leaves the app’s other rows alone', async () => {
    const site = await add({provider: 'Vercel', service: 'Hosting'});
    await add({provider: 'Cloudflare', service: 'Workers'});
    const feeds = fakeFeeds({[FEED_URL.vercel]: ALL_CLEAR, [FEED_URL.cloudflare]: ALL_CLEAR});

    const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: feeds.fetchText, only: [site.id]});

    expect(feeds.requested).toEqual([FEED_URL.vercel]);
    expect(byService(rows, 'Workers').healthCheckedAt).toBeNull();
    expect(byService(rows, 'Hosting').healthCheckedAt).not.toBeNull();
  });

  // Hostile feeds: nothing a source says is trusted.

  it('a failed check never shows ok: a row with nothing found is na with the failed source named, until a later check reads it', async () => {
    await add({provider: 'Vercel', service: 'Hosting'});
    const down = fakeFeeds({[FEED_URL.vercel]: new Error('HTTP 503')});

    const [failed] = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: down.fetchText});
    expect(failed).toMatchObject({status: HEALTH_STATUS.na, healthError: 'Vercel status could not be reached (HTTP 503)', incidents: []});
    expect(failed.healthCheckedAt).not.toBeNull();

    const [read] = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.vercel]: ALL_CLEAR}).fetchText});
    expect(read).toMatchObject({status: HEALTH_STATUS.ok, healthError: null});
  });

  it('a status feed that is not in its documented shape is a failed source, never "all clear", and keeps the incidents an earlier check found', async () => {
    await add({provider: 'Cloudflare', service: 'Workers'});
    await add({provider: 'Google Cloud', service: 'Cloud Run', region: 'us-central1'});
    await add({provider: 'AWS', service: 'EC2', region: 'me-central-1'});
    await add({provider: 'Azure', service: 'Storage'});
    const good = {
      [FEED_URL.cloudflare]: statuspageSummary([{name: 'Workers scripts failing to deploy', impact: 'major', components: ['Workers']}]),
      [FEED_URL.googleCloud]: googleCloudIncidents([{description: 'Cloud Run deployments failing', impact: 'SERVICE_OUTAGE', products: ['Cloud Run'], locations: ['us-central1']}]),
      [FEED_URL.aws]: awsCurrentEvents([{region: 'me-central-1', status: '3', service: 'Multiple services', impacted: ['Amazon Elastic Compute Cloud']}]),
      [FEED_URL.azure]: azureStatusRss([{title: 'Azure Storage - Investigating', description: 'Storage accounts may be unreachable.'}]),
    };
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds(good).fetchText});

    const malformed: Record<string, string[]> = {
      [FEED_URL.cloudflare]: [
        'null',
        '[]',
        '{}',
        '{"incidents": "none", "scheduled_maintenances": []}',
        '{"incidents": [null], "scheduled_maintenances": []}',
        '{"incidents": [{"name": 42, "impact": "major", "components": []}], "scheduled_maintenances": []}',
        '{"incidents": [{"name": "", "impact": "major", "components": []}], "scheduled_maintenances": []}',
        '{"incidents": [{"name": "Down", "impact": {"$gt": ""}, "components": []}], "scheduled_maintenances": []}',
        '{"incidents": [{"name": "Down", "impact": "major", "components": {"length": 1}}], "scheduled_maintenances": []}',
        '{"incidents": [{"name": "Down", "impact": "major", "components": [{"name": ["Workers"]}]}], "scheduled_maintenances": []}',
        '{"incidents": [], "scheduled_maintenances": 7}',
      ],
      [FEED_URL.googleCloud]: ['{}', '"incidents"', '[{"external_desc": null}]', '[{"external_desc": "Down", "uri": 5, "status_impact": "SERVICE_OUTAGE", "affected_products": [], "currently_affected_locations": []}]', '[{"external_desc": "Down", "uri": "incidents/x", "status_impact": "SERVICE_OUTAGE", "affected_products": "all", "currently_affected_locations": []}]'],
      [FEED_URL.aws]: ['{}', '[1]', '[{"arn": 1}]', '[{"arn": "arn:aws:health:me-central-1::event/X", "service_name": "EC2", "summary": "Down", "region_name": "Example", "impacted_services": [1]}]'],
      [FEED_URL.azure]: ['<html><body>Sign in</body></html>', '{"rss": true}', ''],
    };
    for (const [url, bodies] of Object.entries(malformed)) {
      for (const body of bodies) {
        const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({...good, [url]: body}).fetchText});
        const [broken] = rows.filter((row) => row.healthError !== null);
        expect(broken?.healthError, body).toMatch(/ sent an unexpected format$/);
        expect(rows.filter((row) => row.healthError !== null), body).toHaveLength(1);
        // Every row still has the incident its last good check found.
        expect(rows.map((row) => row.incidents.length), body).toEqual([1, 1, 1, 1]);
      }
    }
  });

  it('everything a status feed sends is cleaned and cut before it is stored: long titles, too many incidents, and control characters', async () => {
    await add({provider: 'Cloudflare', service: 'Workers'});
    const flood = Array.from({length: 250}, (_, index) => ({
      name: `Incident ${index}\u0000\u0007${'x'.repeat(1_000)}`,
      impact: 'major',
      components: ['Workers', ...Array.from({length: 120}, (_, n) => `Component ${n} ${'y'.repeat(20)}`)],
    }));

    const [row] = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.cloudflare]: statuspageSummary(flood)}).fetchText});

    expect(row.healthError).toBeNull();
    expect(row.incidents).toHaveLength(HOSTING_MAX_INCIDENTS);
    for (const stored of row.incidents) {
      expect(stored.title.length).toBeLessThanOrEqual(INCIDENT_TITLE_MAX_LENGTH);
      expect(stored.title).not.toMatch(/[\u0000-\u001f]/);
    }
    expect(row.incidents[0].title.startsWith('Incident 0 x')).toBe(true);
  });

  it('an incident link is only stored when it is https on the provider’s own status host: a planted link is dropped, the incident is kept', async () => {
    await add({provider: 'Cloudflare', service: 'Workers'});
    await add({provider: 'Google Cloud', service: 'Cloud Run'});
    await add({provider: 'Azure', service: 'Storage'});
    await add({provider: 'AWS', service: 'EC2'});
    const {fetchText} = fakeFeeds({
      [FEED_URL.cloudflare]: statuspageSummary([
        {name: 'Planted id', impact: 'major', components: ['Workers'], id: '../../evil.example/x'},
        {name: 'Normal id', impact: 'major', components: ['Workers'], id: 'q1w2e3r4t5y6'},
      ]),
      [FEED_URL.googleCloud]: googleCloudIncidents([{description: 'Cloud Run failing', impact: 'SERVICE_OUTAGE', products: ['Cloud Run'], locations: []}]).replace('incidents/g0', '/evil.example/phish?x=javascript:alert(1)'),
      [FEED_URL.azure]: azureStatusRss([
        {title: 'Azure Storage - planted link', description: 'Storage', link: 'https://evil.example/azure.status.microsoft'},
        {title: 'Azure Storage - script link', description: 'Storage', link: 'javascript:alert(document.cookie)'},
        {title: 'Azure Storage - own link', description: 'Storage', link: 'https://azure.status.microsoft/en-us/status/history/'},
      ]),
      [FEED_URL.aws]: awsCurrentEvents([{region: 'global', status: '3', service: 'Amazon Elastic Compute Cloud', impacted: []}]),
    });

    const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText});
    const links = (service: string) => Object.fromEntries(byService(rows, service).incidents.map((incident) => [incident.title, incident.url]));

    expect(links('Workers')).toEqual({'Planted id': null, 'Normal id': `${statusPage('Cloudflare')}/incidents/q1w2e3r4t5y6`});
    // Whatever path the feed gives, the link stays on the status host.
    expect(new URL(links('Cloud Run')['Cloud Run failing']!).host).toBe('status.cloud.google.com');
    expect(links('Storage')).toEqual({
      'Azure Storage - planted link': statusPage('Azure'),
      'Azure Storage - script link': statusPage('Azure'),
      'Azure Storage - own link': 'https://azure.status.microsoft/en-us/status/history/',
    });
    expect(Object.values(links('EC2'))).toEqual([statusPage('AWS')]);
    for (const row of rows) {
      for (const incident of row.incidents) {
        expect(incident.url === null || incident.url.startsWith('https://')).toBe(true);
      }
    }
  });

  it('an endoflife.date document that is not in its documented shape is a failed source and leaves the earlier date; a date that is not a calendar date is not used', async () => {
    await add({provider: 'Azure', service: 'Database for PostgreSQL', version: '12'});
    const check = (document: string) =>
      refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[AZURE_POSTGRES]: document, [FEED_URL.azure]: NO_AZURE_INCIDENTS}).fetchText});
    await check(POSTGRES_ON_AZURE);

    for (const document of ['null', '[]', '{}', '{"result": {"releases": "12"}}', '{"result": {"releases": [null]}}', '{"result": {"releases": [{"name": 12, "eolFrom": "2020-01-01"}]}}']) {
      const [row] = await check(document);
      expect(row, document).toMatchObject({endOfSupportOn: '2026-07-31', healthError: 'endoflife.date sent an unexpected format'});
    }
    for (const eolFrom of ['soon', '2026-02-31', '0', 20260731, true, {date: '2020-01-01'}, null]) {
      const [row] = await check(JSON.stringify({result: {releases: [{name: '12', label: 12, eolFrom}]}}));
      expect(row, String(eolFrom)).toMatchObject({endOfSupportOn: null, endOfSupportSource: null, healthError: null});
    }
  });

  it('a source that answers more than the size cap is a failed source, is not read to the end, and wipes nothing', async () => {
    await add({provider: 'Cloudflare', service: 'Workers'});
    const outage = statuspageSummary([{name: 'Workers scripts failing to deploy', impact: 'major', components: ['Workers']}]);
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.cloudflare]: outage}).fetchText});
    const chunk = new TextEncoder().encode(' '.repeat(1024 * 1024));
    let sent = 0;
    const endless: Fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            sent++;
            controller.enqueue(chunk);
          },
        }),
      );

    const [row] = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: createFetchText(endless)});

    expect(row).toMatchObject({healthError: 'Cloudflare status could not be reached (answer over the size cap)', incidents: [{title: 'Workers scripts failing to deploy'}]});
    // Reading stopped at the cap: the stream never ends, so reading it all would never return.
    expect(sent).toBeLessThan(10);
  });

  it('a huge, repetitive feed is read in bounded time and to bounded size', async () => {
    await add({provider: 'Azure', service: 'Storage', region: 'westeurope'});
    const unclosed = `<rss>${'<item><title>Azure Storage'.repeat(100_000)}`;
    const nested = `<rss><item>${'<title>'.repeat(200_000)}</item></rss>`;
    const started = Date.now();

    for (const body of [unclosed, nested]) {
      const [row] = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.azure]: body}).fetchText});
      expect(row.incidents.length).toBeLessThanOrEqual(HOSTING_MAX_INCIDENTS);
    }
    expect(Date.now() - started).toBeLessThan(4000);
  });

  it('the hosting check sends nothing a person typed: only the fixed feed URLs and catalog product names, with a User-Agent that names the product', async () => {
    await add({provider: 'azure', service: 'database for postgresql', region: 'secret-region-9', version: '12 (ticket ACME-4411)'});
    await add({provider: 'Vercel', service: 'Hosting', runtime: 'node', runtimeVersion: '../../admin'});
    const sent: {url: string; headers: Record<string, string>; redirect?: string}[] = [];
    const feeds = fakeFeeds({[AZURE_POSTGRES]: POSTGRES_ON_AZURE, [NODE]: NODEJS, [FEED_URL.azure]: NO_AZURE_INCIDENTS, [FEED_URL.vercel]: ALL_CLEAR});
    const recording: Fetch = (url, init) => {
      sent.push({url, headers: {...(init?.headers as Record<string, string>)}, redirect: init?.redirect});
      return feeds.fetch(url, init);
    };

    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: createFetchText(recording)});

    expect(sent.map(({url}) => url).sort()).toEqual([AZURE_POSTGRES, NODE, FEED_URL.azure, FEED_URL.vercel].sort());
    for (const request of sent) {
      expect(request.headers).toEqual({'user-agent': 'app-register'});
      // A feed that redirects is a failed source; the check never follows it elsewhere.
      expect(request.redirect).toBe('error');
    }
  });

  it('a feed stuffed with text does not slow the check down as the workspace grows: every row is still matched in bounded time', async () => {
    for (let index = 0; index < 30; index++) {
      await add({provider: 'Azure', service: 'Storage', region: `region${index}`});
    }
    const words = Array.from({length: 1_200}, (_, index) => `w${index % 97}`).join(' ');
    const stuffed = azureStatusRss(Array.from({length: 300}, (_, index) => ({title: `Incident ${index}`, description: `${words} <${'<'.repeat(2_000)}`})));
    const started = Date.now();

    const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.azure]: stuffed}).fetchText});

    expect(Date.now() - started).toBeLessThan(5000);
    expect(rows).toHaveLength(30);
    expect(rows.every((row) => row.healthError === null && row.incidents.length === HOSTING_MAX_INCIDENTS)).toBe(true);
  });
});
