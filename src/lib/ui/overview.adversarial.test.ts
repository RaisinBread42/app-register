/**
 * Adversarial tests for [28] Overview, kept as regression tests after the fixes.
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {APP_KIND, MATCH_STATUS, NOTICE_SEVERITY} from '@/lib/constants';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {endOfLifeUrlFor, FEED_URL, NODEJS, azureStatusRss, fakeFeeds} from '@/lib/monitoring/test/feeds';
import {createApp, listActiveApps} from '@/lib/services/apps';
import {addDependency} from '@/lib/services/dependencies';
import {addHosting} from '@/lib/services/hosting';
import {refreshHostingHealth} from '@/lib/services/hosting-monitor';
import {listMonitoringSources} from '@/lib/services/monitoring-sources';
import {createPerson} from '@/lib/services/people';
import type {App, Notice} from './api-client';
import {keyNumbers, lastSuccessfulCheck, portfolioNote, portfolioSummary, upcomingDates, urgentQueue} from './overview';

const TODAY = '2026-11-28';

const app = (name: string, extra: Partial<App> = {}): App =>
  ({id: `${name}-id`, name, noticeDeadline: null, renewalDate: null, health: {score: null}, ...extra}) as unknown as App;

const notice = (title: string, severity: string, appName: string, status: string = MATCH_STATUS.new): Notice =>
  ({
    id: title,
    title,
    severity,
    category: 'security',
    dueOn: null,
    lastSeenAt: '2026-11-28T09:00:00Z',
    matches: [{id: `${title}-m`, app: {id: `${appName}-id`, name: appName}, status, resolvedAt: null}],
  }) as unknown as Notice;

describe('[28] Overview adversarial — pure rules', () => {
  it('ADV1 AC4: a snoozed critical notice is counted separately on the Overview (not silently dropped)', () => {
    const notices = [notice('Request smuggling', NOTICE_SEVERITY.critical, 'Portal', MATCH_STATUS.snoozed), notice('Minor', NOTICE_SEVERITY.low, 'Fleet')];
    const numbers = keyNumbers(notices, [app('Portal'), app('Fleet')], [], TODAY);
    const queue = urgentQueue(notices);
    // The snoozed critical is in neither the queue nor any number the Overview renders.
    expect(queue.map((row) => row.notice.title)).toEqual(['Minor']);
    expect(numbers, 'AC4: "snoozed items are counted separately" — no snoozed count exists').toHaveProperty('snoozed', 1);
  });

  it('ADV2 AC4/Journey D: a notice deadline that passed yesterday with no decision stays visible on the Overview', () => {
    const apps = [app('Ledgerline', {noticeDeadline: '2026-11-27', renewalDate: '2026-12-27'})];
    const dates = upcomingDates(apps, TODAY);
    const numbers = keyNumbers([], apps, [], TODAY);
    // Yesterday it was "1 notice deadline in 30 days" and listed; today it is gone from every Overview section.
    expect(keyNumbers([], apps, [], '2026-11-27').deadlinesSoon).toBe(1);
    expect(numbers.deadlinesSoon).toBe(0);
    expect(dates.map((row) => `${row.kind} ${row.date}`), 'overdue notice deadline silently disappears').toContain('notice 2026-11-27');
    expect(numbers.overdue, 'the passed deadline is counted').toBe(1);
  });

  it('ADV5 AC1.2: data last refreshed 88 days ago raises the stale-data indicator', () => {
    const stale = [{id: 's', name: 'OSV.dev', monitors: 'x', status: 'reachable', lastRefreshedAt: '2026-09-01T05:00:00.000Z', url: 'https://osv.dev'}] as never;
    const numbers = keyNumbers([], [app('Portal', {health: {score: 100} as App['health']})], stale, TODAY);
    expect(numbers.staleSources, 'an 88-day-old last check is flagged as out of date').toBeGreaterThan(0);
  });
});

describe('[28] Overview adversarial — against the real services', () => {
  let t: TestDb;
  let ownerId: string;
  let backupOwnerId: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'})).id;
    backupOwnerId = (await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'})).id;
  });
  afterEach(async () => {
    await t.client.close();
  });

  const newApp = async (name: string) =>
    (await createApp(t.db, t.workspaceId, {name, kind: APP_KIND.inHouse, ownerId, backupOwnerId})).id;

  it('ADV3 portfolio copy: an app WITH a recorded dependency (not yet checked) is not described as "no dependencies or hosting recorded"', async () => {
    const appId = await newApp('Customer Portal');
    await addDependency(t.db, t.workspaceId, appId, {name: 'express', currentVersion: '4.17.1'});
    const apps = (await listActiveApps(t.db, t.workspaceId, {}, TODAY)) as unknown as App[];

    const note = portfolioNote(portfolioSummary(apps, []));
    expect(note, 'Overview must not claim this app has "no dependencies or hosting recorded"; it has 1 dependency').not.toMatch(/no dependencies or hosting recorded/);
    expect(note).toMatch(/not checked yet/);
  });

  it('ADV4 "Last successful check" must not show the time of a check run in which every source failed', async () => {
    const appId = await newApp('Customer Portal');
    await addHosting(t.db, t.workspaceId, appId, {provider: 'Azure', service: 'App Service', runtime: 'Node.js', runtimeVersion: '22'});
    const goodRun = new Date('2026-11-27T05:00:00Z');
    const failedRun = new Date('2026-11-28T05:00:00Z');

    const ok = fakeFeeds({[endOfLifeUrlFor('nodejs')]: NODEJS, [FEED_URL.azure]: azureStatusRss([])});
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: ok.fetchText, now: goodRun});
    const down = fakeFeeds({[endOfLifeUrlFor('nodejs')]: new Error('ECONNRESET'), [FEED_URL.azure]: new Error('ECONNRESET')});
    await refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText: down.fetchText, now: failedRun});

    const sources = await listMonitoringSources(t.db, t.workspaceId);
    // The failed run must never read as the last success. Keeping the earlier success itself needs durable
    // per-source history, which [31] adds; until then the header says no source answered on the last check.
    expect(lastSuccessfulCheck(sources), 'header says "Last successful check" = the failed run').not.toBe(failedRun.toISOString());
  });
});
