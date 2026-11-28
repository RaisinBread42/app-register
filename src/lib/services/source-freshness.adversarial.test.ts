import {eq} from 'drizzle-orm';
import {beforeEach, describe, expect, it} from 'vitest';
import {ADVISORY_SEVERITY, APP_KIND, HEALTH_STATUS, MONITORING_SOURCE_ID, MONITORING_SOURCE_STATUS, NPM_REGISTRY_URL} from '@/lib/constants';
import {appDependencies, appHosting} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {ALL_CLEAR, FEED_URL, NODEJS, POSTGRES_ON_AZURE, azureStatusRss, endOfLifeUrlFor, fakeFeeds} from '@/lib/monitoring/test/feeds';
import {HEALTH_STATUS_VARIANT} from '@/lib/ui/copy';
import {staleSources} from '@/lib/ui/freshness';
import {checkStatusLine} from '@/lib/ui/overview';
import {archiveApp, createApp, getApp} from './apps';
import {addDependency} from './dependencies';
import {refreshDependencyHealth, refreshWorkspaceDependencyHealth, type DependencyFacts} from './dependency-health';
import {appHealth} from './health';
import {addHosting, removeHosting} from './hosting';
import {refreshHostingHealth} from './hosting-monitor';
import {listMonitoringSources} from './monitoring-sources';
import {createPackageSources, type Fetch} from './package-sources';
import {createPerson} from './people';
import {listSourceChecks} from './source-checks';
import {fakeRegistry} from './test/fake-registry';

/** ADV31: adversarial tests for [31] source freshness. Each expectation states the rule the change claims. */

const HOUR = 60 * 60 * 1000;

describe('ADV31 source freshness', () => {
  let t: TestDb;
  let ownerId: string;
  let appId: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'})).id;
    appId = (await createApp(t.db, t.workspaceId, {name: 'Customer Portal', kind: APP_KIND.inHouse, ownerId})).id;
  });

  const sources = () => listMonitoringSources(t.db, t.workspaceId);
  const source = async (id: string) => (await sources()).find((s) => s.id === id)!;

  it('ADV31-U1 partial npm outage: 2 of 3 registry requests fail; the source must not read reachable with no error while those deps are stale', async () => {
    for (const name of ['express', 'left-pad', 'lodash']) {
      await addDependency(t.db, t.workspaceId, appId, {name, currentVersion: '1.0.0'});
    }
    const latest = {express: '1.0.0', 'left-pad': '1.0.0', lodash: '1.0.0'};
    await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fakeRegistry({latest}).fetch)});
    await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fakeRegistry({latest, down: ['left-pad', 'lodash']}).fetch)});

    const app = await getApp(t.db, t.workspaceId, appId);
    const npm = await source(MONITORING_SOURCE_ID.npmRegistry);
    const stored = (await listSourceChecks(t.db, t.workspaceId)).get(MONITORING_SOURCE_ID.npmRegistry);
    expect(app.health.status).toBe(HEALTH_STATUS.stale);
    expect(stored?.lastError).toBe('npm registry did not answer for 2 of 3 packages');
    expect(npm.lastError, 'the run had registry failures; the last error must be recorded').not.toBeNull();
    expect(staleSources([npm], new Date()).length, 'Overview must flag the source behind the stale deps').toBe(1);
  });

  it('ADV31-U2 workspace refresh: one app\'s registry request fails, the next app\'s succeeds; the failure must not be erased by the later app', async () => {
    const otherId = (await createApp(t.db, t.workspaceId, {name: 'Billing Hub', kind: APP_KIND.inHouse, ownerId})).id;
    await addDependency(t.db, t.workspaceId, appId, {name: 'express', currentVersion: '1.0.0'});
    await addDependency(t.db, t.workspaceId, otherId, {name: 'lodash', currentVersion: '1.0.0'});
    const good = fakeRegistry({latest: {express: '1.0.0', lodash: '1.0.0'}}).fetch;
    await refreshWorkspaceDependencyHealth(t.db, t.workspaceId, createPackageSources(good));

    // A flaky registry: the first package lookup of the run gets a 503, the rest answer.
    let npmCalls = 0;
    const flaky: Fetch = async (url, init) => {
      if (url.startsWith(`${NPM_REGISTRY_URL}/`) && npmCalls++ === 0) {
        return Response.json({error: 'unavailable'}, {status: 503});
      }
      return good(url, init);
    };
    await refreshWorkspaceDependencyHealth(t.db, t.workspaceId, createPackageSources(flaky));

    const statuses = [(await getApp(t.db, t.workspaceId, appId)).health.status, (await getApp(t.db, t.workspaceId, otherId)).health.status];
    const npm = await source(MONITORING_SOURCE_ID.npmRegistry);
    expect(statuses).toContain(HEALTH_STATUS.stale);
    expect(npm.lastError, 'the daily run had a registry failure').not.toBeNull();
  });

  it('ADV31-U3 endoflife.date answers 200 in an unexpected format: the row is stale, so the source must not be recorded as answering', async () => {
    await addHosting(t.db, t.workspaceId, appId, {provider: 'Azure', service: 'App Service', runtime: 'Node.js', runtimeVersion: '22'});
    const feeds = (eol: string) => fakeFeeds({[FEED_URL.azure]: azureStatusRss([]), [endOfLifeUrlFor('nodejs')]: eol}).fetchText;
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: feeds(NODEJS)});
    const [row] = await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: feeds('{"unexpected":true}')});

    const eol = await source(MONITORING_SOURCE_ID.endOfLifeDate);
    expect(row.status).toBe(HEALTH_STATUS.stale);
    expect(eol.status, 'the source gave no usable answer').toBe(MONITORING_SOURCE_STATUS.unavailable);
  });

  it('ADV31-U4 partial endoflife.date outage: one product 503s, another answers; the failing product\'s row is stale and the source records the error', async () => {
    await addHosting(t.db, t.workspaceId, appId, {provider: 'Azure', service: 'Database for PostgreSQL', version: '16'});
    await addHosting(t.db, t.workspaceId, appId, {provider: 'Azure', service: 'App Service', runtime: 'Node.js', runtimeVersion: '22'});
    const pg = endOfLifeUrlFor('azure-database-for-postgresql');
    await refreshHostingHealth(t.db, t.workspaceId, appId, {
      fetchText: fakeFeeds({[FEED_URL.azure]: azureStatusRss([]), [pg]: POSTGRES_ON_AZURE, [endOfLifeUrlFor('nodejs')]: NODEJS}).fetchText,
    });
    const rows = await refreshHostingHealth(t.db, t.workspaceId, appId, {
      fetchText: fakeFeeds({[FEED_URL.azure]: azureStatusRss([]), [pg]: new Error('HTTP 503'), [endOfLifeUrlFor('nodejs')]: NODEJS}).fetchText,
    });
    const eol = await source(MONITORING_SOURCE_ID.endOfLifeDate);
    expect(rows.map((r) => r.status)).toContain(HEALTH_STATUS.stale);
    expect(eol.lastError, 'a request to endoflife.date failed on this run').not.toBeNull();
  });

  it('ADV31-U5 a critical app whose source then fails keeps its red signal (stale must not turn critical grey)', () => {
    const checkedAt = new Date('2026-11-20T06:00:00Z');
    const advisory = (id: string) => ({id, aliases: [], severity: ADVISORY_SEVERITY.critical, summary: id, url: `https://osv.dev/vulnerability/${id}`});
    const dep = (name: string, patch: Partial<DependencyFacts> = {}): DependencyFacts => ({
      name, currentVersion: '1.0.0', latestVersion: '1.0.0', vulnerabilities: [], advisories: [], isDev: false, checkedAt, checkError: null, ...patch,
    });
    const facts = {today: '2026-11-22', hosting: [], dependencies: [dep('ledger', {advisories: [advisory('GHSA-1'), advisory('GHSA-2'), advisory('GHSA-3')]})]};
    const fresh = appHealth(facts);
    const stale = appHealth({...facts, dependencies: [...facts.dependencies, dep('tally', {checkError: 'unavailable'})]});
    expect(fresh).toMatchObject({score: 70, status: HEALTH_STATUS.critical});
    expect(HEALTH_STATUS_VARIANT[stale.status], 'score 70 is critical; a failed check elsewhere must not grey it out').toBe('red');
  });

  it('ADV31-U6 a hosting row as the old code left it after a failed first check (healthCheckedAt = failure time) must not read as a score of 100, stale', async () => {
    const {id} = await addHosting(t.db, t.workspaceId, appId, {provider: 'Azure', service: 'App Service'});
    // cb0fe21 wrote healthCheckedAt: now on every run, failed or not.
    await t.db.update(appHosting).set({healthCheckedAt: new Date('2026-11-01T06:00:00Z'), healthError: 'Azure status could not be reached (HTTP 503)'}).where(eq(appHosting.id, id));
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.azure]: new Error('HTTP 503')}).fetchText});
    const app = await getApp(t.db, t.workspaceId, appId);
    expect(app.health.score, 'no source ever answered for this row: there is no last valid reading to keep').toBeNull();
  });

  it('ADV31-U7 an app on "Microsoft Azure" (a catalog alias, checked against the Azure feed) is listed under the Azure status source', async () => {
    await addHosting(t.db, t.workspaceId, appId, {provider: 'Microsoft Azure', service: 'App Service'});
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.azure]: new Error('HTTP 503')}).fetchText});
    const azure = (await sources()).find((s) => s.name === 'Azure status')!;
    expect(azure.status).toBe(MONITORING_SOURCE_STATUS.unavailable);
    expect(azure.appNames, 'the failing feed is the one this app relies on').toEqual(['Customer Portal']);
  });

  it('ADV31-U8 a source no active app relies on any more is not counted "out of date" on the Overview forever', async () => {
    const vercel = await addHosting(t.db, t.workspaceId, appId, {provider: 'Vercel', service: 'Hosting'});
    await refreshHostingHealth(t.db, t.workspaceId, appId, {now: new Date(Date.now() - 48 * HOUR), fetchText: fakeFeeds({[FEED_URL.vercel]: ALL_CLEAR}).fetchText});
    await removeHosting(t.db, t.workspaceId, appId, vercel.id);

    const otherId = (await createApp(t.db, t.workspaceId, {name: 'Old Intranet', kind: APP_KIND.inHouse, ownerId})).id;
    await addHosting(t.db, t.workspaceId, otherId, {provider: 'Netlify', service: 'Hosting'});
    await refreshHostingHealth(t.db, t.workspaceId, otherId, {fetchText: fakeFeeds({[FEED_URL.netlify]: new Error('HTTP 503')}).fetchText});
    await archiveApp(t.db, t.workspaceId, otherId);

    const out = staleSources(await sources(), new Date());
    expect(out.filter((s) => s.appNames.length === 0), 'nothing relies on these, and nothing will ever ask them again').toEqual([]);
  });

  it('ADV31-U9 a range-version dependency keeps its last reading when the registry fails (AC2), instead of losing the score', async () => {
    await addDependency(t.db, t.workspaceId, appId, {name: 'express', currentVersion: '^4.21.0'});
    await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fakeRegistry({latest: {express: '4.21.2'}}).fetch)});
    const before = (await getApp(t.db, t.workspaceId, appId)).health;
    await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fakeRegistry({latest: {express: '4.21.2'}, down: ['express']}).fetch)});
    const after = (await getApp(t.db, t.workspaceId, appId)).health;
    expect(before.score).not.toBeNull();
    expect(after, 'the last valid reading is kept and labelled stale').toMatchObject({score: before.score, status: HEALTH_STATUS.stale});
  });

  it('ADV31-U10 a slow run that started earlier records after a newer failed run: the newest attempt must still win', async () => {
    await addHosting(t.db, t.workspaceId, appId, {provider: 'Vercel', service: 'Hosting'});
    const startedEarlier = new Date(Date.now() - 60_000);
    const startedLater = new Date();
    // The quick "Check now" started later and failed; the daily job started earlier and finishes (records) last.
    await refreshHostingHealth(t.db, t.workspaceId, appId, {now: startedLater, fetchText: fakeFeeds({[FEED_URL.vercel]: new Error('HTTP 503')}).fetchText});
    await refreshHostingHealth(t.db, t.workspaceId, appId, {now: startedEarlier, fetchText: fakeFeeds({[FEED_URL.vercel]: ALL_CLEAR}).fetchText});
    const vercel = (await sources()).find((s) => s.name === 'Vercel status')!;
    expect(Date.parse(vercel.lastAttemptAt!), 'lastAttemptAt never moves backwards').toBeGreaterThanOrEqual(startedLater.getTime());
  });
  it('ADV31-U11 AC4: when every source in use fails, the Overview still shows when the data was last good', async () => {
    await addHosting(t.db, t.workspaceId, appId, {provider: 'Vercel', service: 'Hosting'});
    const lastGood = new Date(Date.now() - 6 * HOUR);
    await refreshHostingHealth(t.db, t.workspaceId, appId, {now: lastGood, fetchText: fakeFeeds({[FEED_URL.vercel]: ALL_CLEAR}).fetchText});
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: fakeFeeds({[FEED_URL.vercel]: new Error('HTTP 503')}).fetchText});
    const listed = await sources();
    const vercel = listed.find((s) => s.name === 'Vercel status')!;
    const line = checkStatusLine(listed);
    expect(vercel.lastRefreshedAt).toBe(lastGood.toISOString());
    expect(line, 'AC4: the time of the last successful check').toContain('Last successful check');
  });

  it('ADV31-U12 upgrade path: a source that answered before checks were recorded does not read "Never answered" after its first recorded failure', async () => {
    const {id} = await addDependency(t.db, t.workspaceId, appId, {name: 'express', currentVersion: '4.21.2'});
    // A reading taken before [31] (or by the demo seed): stored on the row, nothing in source_checks.
    const before31 = new Date('2026-11-20T06:00:00Z');
    await t.db.update(appDependencies).set({latestVersion: '4.21.2', checkedAt: before31, checkError: null}).where(eq(appDependencies.id, id));
    expect((await source(MONITORING_SOURCE_ID.npmRegistry)).lastRefreshedAt).toBe(before31.toISOString());
    await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fakeRegistry({latest: {}, down: ['express']}).fetch)});
    const npm = await source(MONITORING_SOURCE_ID.npmRegistry);
    const app = await getApp(t.db, t.workspaceId, appId);
    expect(app.health.staleSince).toBe(before31.toISOString());
    expect(npm.lastRefreshedAt, 'it did answer, on 20 Nov: the app still shows that reading').not.toBeNull();
  });
});
