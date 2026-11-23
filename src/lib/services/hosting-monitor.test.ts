import {beforeEach, describe, expect, it} from 'vitest';
import {END_OF_SUPPORT_SOURCE, INCIDENT_IMPACT, INCIDENT_SCOPE} from '@/lib/constants';
import {newId} from '@/lib/db/ids';
import {workspaces} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
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
  statuspageSummary,
} from '@/lib/monitoring/test/feeds';
import {archiveApp, createApp} from './apps';
import {addHosting, listHosting, updateHosting, type HostingInput, type HostingView} from './hosting';
import {refreshHostingHealth, refreshWorkspaceHostingHealth} from './hosting-monitor';
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

    // Sending the looked-up date back unchanged (an edit form does) does not make it manual.
    const edited = await updateHosting(t.db, t.workspaceId, appId, database.id, {region: 'centralus', endOfSupportOn: '2026-07-31'});
    expect(edited.endOfSupportSource).toBe(END_OF_SUPPORT_SOURCE.endOfLifeDate);
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
});
