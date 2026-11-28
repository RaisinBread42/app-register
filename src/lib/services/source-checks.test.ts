import {beforeEach, describe, expect, it} from 'vitest';
import {APP_KIND, HEALTH_STATUS, MONITORING_SOURCE_ID, MONITORING_SOURCE_STATUS} from '@/lib/constants';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {FEED_URL, azureStatusRss, fakeFeeds} from '@/lib/monitoring/test/feeds';
import {createApp, getApp} from './apps';
import {addDependency} from './dependencies';
import {refreshDependencyHealth} from './dependency-health';
import {addHosting} from './hosting';
import {refreshHostingHealth} from './hosting-monitor';
import {listMonitoringSources} from './monitoring-sources';
import {createPackageSources} from './package-sources';
import {createPerson} from './people';
import {listSourceChecks} from './source-checks';
import {fakeRegistry} from './test/fake-registry';

/** [31] Source health is stored per source, and an outage reads as stale, never as healthy (spec §8 check 23). */

describe('source checks', () => {
  let t: TestDb;
  let appId: string;

  beforeEach(async () => {
    t = await createTestDb();
    const ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'})).id;
    appId = (await createApp(t.db, t.workspaceId, {name: 'Customer Portal', kind: APP_KIND.inHouse, ownerId})).id;
  });

  const checkDependencies = (registry: Parameters<typeof fakeRegistry>[0]) =>
    refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fakeRegistry(registry).fetch)});

  it('AC1: each run records when a source was asked, when it last answered and its last error; a recovery clears the error and keeps both times', async () => {
    await addDependency(t.db, t.workspaceId, appId, {name: 'express', currentVersion: '4.17.1'});
    await checkDependencies({latest: {express: '4.21.2'}, isOsvDown: true});
    const failed = (await listSourceChecks(t.db, t.workspaceId)).get(MONITORING_SOURCE_ID.osv);
    expect(failed).toMatchObject({lastSuccessAt: null, lastError: 'OSV.dev did not answer'});
    expect((await listSourceChecks(t.db, t.workspaceId)).get(MONITORING_SOURCE_ID.npmRegistry)).toMatchObject({lastError: null});

    await checkDependencies({latest: {express: '4.21.2'}});
    const recovered = (await listSourceChecks(t.db, t.workspaceId)).get(MONITORING_SOURCE_ID.osv);
    expect(recovered?.lastError).toBeNull();
    expect(recovered?.lastSuccessAt).not.toBeNull();
    expect(recovered!.lastAttemptAt.getTime()).toBeGreaterThanOrEqual(failed!.lastAttemptAt.getTime());
  });

  it('AC2/AC5: a source outage after a good check keeps the last reading but makes the dependency and the app stale, never ok', async () => {
    await addDependency(t.db, t.workspaceId, appId, {name: 'express', currentVersion: '4.21.2'});
    await checkDependencies({latest: {express: '4.21.2'}});
    expect((await getApp(t.db, t.workspaceId, appId)).health).toMatchObject({score: 100, status: HEALTH_STATUS.ok, staleSince: null});

    await checkDependencies({latest: {express: '4.21.2'}, isOsvDown: true});
    const app = await getApp(t.db, t.workspaceId, appId);
    expect(app.health).toMatchObject({score: 100, status: HEALTH_STATUS.stale, hasFailedCheck: true});
    expect(app.health.staleSince).not.toBeNull();
    expect(app.health.dimensions.dependencies?.status).toBe(HEALTH_STATUS.stale);
    expect(app.dependencies[0].status).toBe(HEALTH_STATUS.stale);
  });

  it('AC3: the sources list shows the stored status, last success, last error and which apps rely on each source', async () => {
    await addHosting(t.db, t.workspaceId, appId, {provider: 'Azure', service: 'App Service'});
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.azure]: azureStatusRss([])}).fetchText});
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.azure]: new Error('HTTP 503')}).fetchText});

    const azure = (await listMonitoringSources(t.db, t.workspaceId)).find((source) => source.name.includes('Azure'));
    expect(azure).toMatchObject({status: MONITORING_SOURCE_STATUS.unavailable, appNames: ['Customer Portal']});
    expect(azure?.lastRefreshedAt).not.toBeNull();
    expect(azure?.lastError).toMatch(/HTTP 503/);
    const hosting = (await getApp(t.db, t.workspaceId, appId)).hosting[0];
    expect(hosting.status).toBe(HEALTH_STATUS.stale);
  });

  it('a source nothing relies on and never asked stays configured with no apps', async () => {
    const npm = (await listMonitoringSources(t.db, t.workspaceId)).find((source) => source.id === MONITORING_SOURCE_ID.npmRegistry);
    expect(npm).toMatchObject({status: MONITORING_SOURCE_STATUS.configured, lastAttemptAt: null, lastError: null, appNames: []});
  });
});
