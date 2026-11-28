import {eq, sql} from 'drizzle-orm';
import {beforeEach, describe, expect, it} from 'vitest';
import {END_OF_SUPPORT_SOURCE, HEALTH_STATUS, HOSTING_FEED_MAX_RESPONSE_BYTES, INCIDENT_IMPACT, INCIDENT_SCOPE} from '@/lib/constants';
import {newId} from '@/lib/db/ids';
import {appHosting} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {findProvider} from '@/lib/hosting-catalog';
import {endOfSupportDate} from '@/lib/monitoring/end-of-life';
import type {FetchText} from '@/lib/monitoring/http';
import {incidentScope, parseStatusFeed} from '@/lib/monitoring/status-feeds';
import {
  FEED_URL,
  azureStatusRss,
  awsCurrentEvents,
  endOfLifeDocument,
  endOfLifeUrlFor,
  fakeFeeds,
  statuspageSummary,
} from '@/lib/monitoring/test/feeds';
import type {Hosting} from '@/lib/ui/api-client';
import {formToHostingInput, hostingToForm} from '@/lib/ui/forms';
import {createApp, getApp, listActiveApps} from './apps';
import type {DependencyFacts} from './dependency-health';
import {appHealth} from './health';
import type {HostingFacts} from './hosting-health';
import {addHosting, listHosting, updateHosting, type HostingInput, type HostingView} from './hosting';
import {refreshHostingHealth} from './hosting-monitor';
import {createPerson} from './people';

const NOW = new Date('2026-11-23T09:00:00Z');
const RDS_PG = endOfLifeUrlFor('amazon-rds-postgresql');
const RDS_PG_DOC = endOfLifeDocument([
  {name: '16', eolFrom: '2029-02-28'},
  {name: '12', eolFrom: '2025-02-28'},
]);
const NO_AWS_EVENTS = '[]';

/**
 * Regressions from the adversarial review of the hosting check. Each test failed
 * before its fix, unless its name says it is kept as a guard.
 */
describe('review regressions: hosting health', () => {
  let t: TestDb;
  let appId: string;

  beforeEach(async () => {
    t = await createTestDb();
    const owner = (await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'})).id;
    const backup = (await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'})).id;
    appId = (await createApp(t.db, t.workspaceId, {name: 'Portal', kind: 'vendor_service', ownerId: owner, backupOwnerId: backup})).id;
  });

  const add = (input: HostingInput) => addHosting(t.db, t.workspaceId, appId, input);
  const check = (fetchText: FetchText, extra: {only?: string[]; budgetMs?: number} = {}) =>
    refreshHostingHealth(t.db, t.workspaceId, appId, {fetchText, now: NOW, ...extra});
  const byService = (rows: HostingView[], service: string) => rows.find((row) => row.service === service)!;

  // ---- A cap on the feed's own list of affected services must never hide the row's service ----

  it('an AWS outage that lists the row’s service after its 100th impacted service still reaches the row', async () => {
    // The live AWS feed on 2026-11-23 had two open "Multiple services" events listing 140 and 149 impacted services;
    // Amazon Elastic Container Service was number 111 of the me-south-1 event.
    const impacted = [...Array.from({length: 110}, (_, i) => `AWS Filler Service ${i}`), 'Amazon Elastic Container Service'];
    const events = awsCurrentEvents([{region: 'me-south-1', status: '3', service: 'Multiple services', impacted}]);
    await add({provider: 'AWS', service: 'ECS', region: 'me-south-1'});
    await add({provider: 'AWS', service: 'ECS', region: null});

    const rows = await check(fakeFeeds({[FEED_URL.aws]: events}).fetchText);

    expect(rows.map((row) => row.incidents.map((incident) => [incident.impact, incident.scope]))).toEqual([
      [[INCIDENT_IMPACT.major, INCIDENT_SCOPE.service]],
      [[INCIDENT_IMPACT.major, INCIDENT_SCOPE.service]],
    ]);
  });

  it('a Statuspage incident that lists the row’s component after its 100th component still reaches the row', () => {
    const components = [...Array.from({length: 120}, (_, i) => `Datacenter ${i}`), 'CDN/Cache'];
    const feed = findProvider('Cloudflare')!.statusFeed!;
    const [incident] = parseStatusFeed(feed, statuspageSummary([{name: 'Global outage', impact: 'critical', components}]));
    expect(incidentScope(incident, {components: ['CDN/Cache', 'Network'], region: null})).toBe(INCIDENT_SCOPE.service);
  });

  // ---- Azure regions are matched by their full name, never as part of another region's name ----

  it('an Azure incident in "North Central US", "East US 2" and "West US 3" is not an outage on rows in Central US, East US and West US', async () => {
    await add({provider: 'Azure', service: 'Storage', region: 'centralus'});
    await add({provider: 'Azure', service: 'Key Vault', region: 'eastus'});
    await add({provider: 'Azure', service: 'Cosmos DB', region: 'westus'});
    const rss = azureStatusRss([
      {title: 'Networking issue - North Central US', description: 'Customers in North Central US, East US 2 and West US 3 may see failures for Virtual Machines.'},
    ]);

    const rows = await check(fakeFeeds({[FEED_URL.azure]: rss}).fetchText);

    // The feed names three other regions and another service: at most a provider-level notice.
    expect(rows.map((row) => [row.region, row.incidents[0]?.scope, row.status])).toEqual([
      ['westus', INCIDENT_SCOPE.provider, HEALTH_STATUS.attention],
      ['eastus', INCIDENT_SCOPE.provider, HEALTH_STATUS.attention],
      ['centralus', INCIDENT_SCOPE.provider, HEALTH_STATUS.attention],
    ]);
  });

  // ---- The edit dialog never wipes a looked-up date ----

  it('saving the edit dialog of a row with a looked-up date keeps that date: it is cleared only when provider, service, version or runtime changes', async () => {
    const added = await add({provider: 'AWS', service: 'RDS for PostgreSQL', region: 'us-east-1', version: '12'});
    const up = fakeFeeds({[RDS_PG]: RDS_PG_DOC, [FEED_URL.aws]: NO_AWS_EVENTS});
    const [checked] = await check(up.fetchText);
    expect(checked).toMatchObject({endOfSupportOn: '2025-02-28', endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate, status: HEALTH_STATUS.critical});

    // Exactly what HostingTab does: hostingToForm(row) → (user presses Save) → formToHostingInput → PATCH.
    const asApiRow = JSON.parse(JSON.stringify(checked)) as Hosting;
    const saved = await updateHosting(t.db, t.workspaceId, appId, added.id, formToHostingInput(hostingToForm(asApiRow)));
    expect(saved).toMatchObject({endOfSupportOn: '2025-02-28', endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate});
  });

  it('a looked-up date survives a save of the edit dialog even when endoflife.date is down for the check that follows', async () => {
    const added = await add({provider: 'AWS', service: 'RDS for PostgreSQL', region: 'us-east-1', version: '12'});
    const [checked] = await check(fakeFeeds({[RDS_PG]: RDS_PG_DOC, [FEED_URL.aws]: NO_AWS_EVENTS}).fetchText);
    const asApiRow = JSON.parse(JSON.stringify(checked)) as Hosting;

    await updateHosting(t.db, t.workspaceId, appId, added.id, formToHostingInput(hostingToForm(asApiRow)));
    const [after] = await check(fakeFeeds({[RDS_PG]: new Error('fetch failed'), [FEED_URL.aws]: NO_AWS_EVENTS}).fetchText, {only: [added.id]});

    expect(after.healthError).toContain('endoflife.date');
    expect(after).toMatchObject({endOfSupportOn: '2025-02-28', status: HEALTH_STATUS.critical});
    expect((await getApp(t.db, t.workspaceId, appId, '2026-11-23')).health.score).toBe(75);
  });

  // ---- A date handed back to the check is not ok before a check has looked it up ----

  it('a row whose date was just handed back to the check is not ok until a check has completed for it', async () => {
    const added = await add({provider: 'AWS', service: 'RDS for PostgreSQL', region: 'us-east-1', version: '12', endOfSupportOn: '2031-01-01'});
    const [checked] = await check(fakeFeeds({[RDS_PG]: RDS_PG_DOC, [FEED_URL.aws]: NO_AWS_EVENTS}).fetchText);
    expect(checked).toMatchObject({endOfSupportSource: END_OF_SUPPORT_SOURCE.manual, status: HEALTH_STATUS.ok});

    await updateHosting(t.db, t.workspaceId, appId, added.id, {endOfSupportOn: null});
    // The check that follows the write never completes: the sources do not answer inside the budget.
    const hang: FetchText = (_url, signal) => new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const [row] = await check(hang, {only: [added.id], budgetMs: 30});

    expect(row).toMatchObject({endOfSupportOn: null, endOfSupportSource: null});
    // PostgreSQL 12 on RDS went out of support on 2025-02-28; nothing has looked that up yet.
    expect(row.status).toBe(HEALTH_STATUS.na);
  });

  // ---- Any date a client sends is a manual date ----

  it('a date typed by hand is never overwritten, also when it equals the date the check had found', async () => {
    const added = await add({provider: 'AWS', service: 'RDS for PostgreSQL', region: 'us-east-1', version: '16'});
    await check(fakeFeeds({[RDS_PG]: RDS_PG_DOC, [FEED_URL.aws]: NO_AWS_EVENTS}).fetchText);

    // The dialog shows an empty "End of support (set by hand)" field for a looked-up row; the user types the date.
    const typed = await updateHosting(t.db, t.workspaceId, appId, added.id, {endOfSupportOn: '2029-02-28'});
    expect(typed.endOfSupportSource).toBe(END_OF_SUPPORT_SOURCE.manual);

    const revised = endOfLifeDocument([{name: '16', eolFrom: '2027-01-01'}]);
    const [after] = await check(fakeFeeds({[RDS_PG]: revised, [FEED_URL.aws]: NO_AWS_EVENTS}).fetchText);
    expect(after.endOfSupportOn).toBe('2029-02-28');
  });

  // ---- A version that matches several releases takes the earliest date, not the newest release's ----

  it('version "8" of a product with releases 8.4 and 8.0 does not silently take 8.4’s later date', () => {
    const mysql = endOfLifeDocument([
      {name: '9.7', eolFrom: '2034-04-30'},
      {name: '8.4', eolFrom: '2032-04-30'},
      {name: '8.0', eolFrom: '2026-04-30'},
    ]);
    expect(endOfSupportDate(mysql, '8')).not.toBe('2032-04-30');
  });

  it('a row whose version matches several releases gets the earliest of their dates and says the version is not exact; an exact version or a date set by hand does not', async () => {
    const mysqlOnRds = endOfLifeUrlFor('amazon-rds-mysql');
    const feeds = fakeFeeds({
      [mysqlOnRds]: endOfLifeDocument([{name: '8.4', eolFrom: '2032-04-30'}, {name: '8.0', eolFrom: '2026-04-30'}]),
      [FEED_URL.aws]: NO_AWS_EVENTS,
    });
    const added = await add({provider: 'AWS', service: 'RDS for MySQL', version: '8'});

    const [inexact] = await check(feeds.fetchText);
    expect(inexact).toMatchObject({endOfSupportOn: '2026-04-30', endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate, isVersionInexact: true, status: HEALTH_STATUS.critical});

    await updateHosting(t.db, t.workspaceId, appId, added.id, {version: '8.4'});
    const [exact] = await check(feeds.fetchText);
    expect(exact).toMatchObject({endOfSupportOn: '2032-04-30', isVersionInexact: false});

    await updateHosting(t.db, t.workspaceId, appId, added.id, {version: '8'});
    expect((await check(feeds.fetchText))[0].isVersionInexact).toBe(true);
    const byHand = await updateHosting(t.db, t.workspaceId, appId, added.id, {endOfSupportOn: '2030-01-01'});
    expect(byHand).toMatchObject({endOfSupportSource: END_OF_SUPPORT_SOURCE.manual, isVersionInexact: false});
    expect((await check(feeds.fetchText))[0]).toMatchObject({endOfSupportOn: '2030-01-01', isVersionInexact: false});
  });

  // ---- A region written another way never hides an outage of the row's service ----

  it('an outage of the row’s own service still reaches a row whose region is written another way (availability zone, display name)', async () => {
    await add({provider: 'AWS', service: 'EC2', region: 'us-east-1a'});
    await add({provider: 'AWS', service: 'S3', region: 'N. Virginia'});
    const events = awsCurrentEvents([
      {region: 'us-east-1', status: '3', service: 'Multiple services', impacted: ['Amazon Elastic Compute Cloud', 'Amazon Simple Storage Service']},
    ]);
    const rows = await check(fakeFeeds({[FEED_URL.aws]: events}).fetchText);
    expect(rows.map((row) => row.incidents.length)).toEqual([1, 1]);
  });

  // ---- The 20-incident cap keeps the heaviest, not the first ----

  it('with more than 20 open incidents the one that is an outage on the row is kept', async () => {
    await add({provider: 'Azure', service: 'Key Vault', region: 'uksouth'});
    const others = Array.from({length: 21}, (_, i) => ({title: `Advisory ${i}`, description: 'A subset of customers may be affected.'}));
    const rss = azureStatusRss([...others, {title: 'Key Vault - UK South', description: 'Key Vault is unavailable in UK South.'}]);
    const [row] = await check(fakeFeeds({[FEED_URL.azure]: rss}).fetchText);
    expect(row.status).toBe(HEALTH_STATUS.critical);
  });

  // ---- Guards: these passed before the fixes and must keep passing ----

  it('hostile feed values never fail the refresh or reach storage unclean: lone surrogates, NUL, look-alike links, wrong types (kept as a guard)', async () => {
    await add({provider: 'GitHub', service: 'Pages'});
    await add({provider: 'Vercel', service: 'Hosting'});
    await add({provider: 'Azure', service: 'Storage'});
    const nasty = 'Bad \ud800 title \u0000\u0007 <img src=x onerror=alert(1)>' + '\ud83d';
    const github = JSON.stringify({
      incidents: [
        {id: '../../../evil', name: nasty, impact: 'critical', started_at: 'not a date', components: [{name: 'Pages'}]},
        {id: 'a@evil.test', name: 'userinfo', impact: 'critical', started_at: 8.64e15 + 1, components: [{name: 'Pages'}]},
      ],
      scheduled_maintenances: [],
    });
    const azure = azureStatusRss([
      {title: 'x', description: 'Storage', link: 'https://azure.status.microsoft.evil.test/'},
      {title: 'y', description: 'Storage', link: 'javascript:alert(1)'},
      {title: 'z', description: 'Storage', link: 'https://azure.status.microsoft@evil.test/'},
    ]);
    const rows = await check(fakeFeeds({[FEED_URL.vercel]: '<html>200 OK</html>', [FEED_URL.azure]: azure, 'https://www.githubstatus.com/api/v2/summary.json': github}).fetchText);

    const pages = byService(rows, 'Pages');
    expect(pages.incidents.map((incident) => incident.url)).toEqual([null, null]);
    expect(pages.incidents[0].title.isWellFormed()).toBe(true);
    expect(pages.incidents[0].title).not.toMatch(/[\u0000-\u001f]/);
    expect(byService(rows, 'Hosting')).toMatchObject({status: HEALTH_STATUS.na, healthError: 'Vercel status sent an unexpected format'});
    expect(byService(rows, 'Storage').incidents.map((incident) => incident.url)).toEqual(Array(3).fill('https://azure.status.microsoft/en-us/status'));
  });

  it('poisoned stored values never fail the list, the detail or the hosting read, and what the old JSON column could hold cannot be stored at all (kept as a guard)', async () => {
    const row = await add({provider: 'Vercel', service: 'Hosting'});
    const insert = (values: {title: unknown; impact: unknown; scope: unknown; url: unknown; startedAt: unknown}, position: number) =>
      t.db.execute(sql`
        insert into hosting_incidents (id, workspace_id, hosting_id, title, impact, scope, url, started_at, position)
        values (${newId()}, ${t.workspaceId}, ${row.id}, ${values.title}, ${values.impact}, ${values.scope}, ${values.url}, ${values.startedAt}, ${position})`);
    const usable = {title: 't', impact: 'major', scope: 'service', url: null, startedAt: null};

    // What the table's own constraints still let a stray write store: any text as a title or a link, an endless time.
    const poisoned = [
      {...usable, url: 'javascript:alert(1)', startedAt: 'infinity'},
      {...usable, title: '\u202e<script>alert(1)</script>', url: 'https://evil.test/www.vercel-status.com', startedAt: '-infinity'},
      {...usable, title: 'x'.repeat(100_000), url: 'x'.repeat(100_000)},
      {...usable, title: '{"toString":1}', url: '["x"]', startedAt: '0001-01-01T00:00:00Z'},
    ];
    for (const [position, bad] of poisoned.entries()) {
      await insert(bad, position);
      await t.db.execute(sql`update app_hosting set health_error = ${'x'.repeat(100_000)}, health_checked_at = 'infinity' where id = ${row.id}`);
      await listActiveApps(t.db, t.workspaceId);
      await getApp(t.db, t.workspaceId, appId);
      const [read] = await listHosting(t.db, t.workspaceId, appId);
      expect(read.incidents).toHaveLength(position + 1);
      expect(read.incidents.map((incident) => incident.url)).toEqual(Array(position + 1).fill(null));
    }

    // The shapes the jsonb column could be poisoned with are refused by the table itself.
    const refused = [
      {...usable, title: null},
      {...usable, title: '   '},
      {...usable, impact: 'apocalyptic'},
      {...usable, impact: null},
      {...usable, scope: 'galaxy'},
      {...usable, scope: null},
      {...usable, startedAt: 'not a time'},
    ];
    for (const bad of refused) {
      await expect(insert(bad, poisoned.length), JSON.stringify(bad)).rejects.toThrow();
    }
    expect((await listHosting(t.db, t.workspaceId, appId))[0].incidents).toHaveLength(poisoned.length);

    await t.db.execute(sql`update app_hosting set end_of_support_on = 'infinity', end_of_support_source = 'manual' where id = ${row.id}`);
    await listActiveApps(t.db, t.workspaceId);
    await getApp(t.db, t.workspaceId, appId);
  });

  it('user text never reaches a fetched URL (kept as a guard)', async () => {
    await add({provider: 'Azure', service: 'Database for PostgreSQL', version: '../../../etc/passwd?x=1#y', region: '@evil.test/'});
    await add({provider: 'AWS', service: 'Lambda', runtime: 'Node.js', runtimeVersion: '%2e%2e%2f‮' + 'a'.repeat(20)});
    await add({provider: 'https://evil.test/', service: '../x', runtime: '../../y', runtimeVersion: '1', version: '2'});
    const feeds = fakeFeeds({});
    await check(feeds.fetchText);
    expect([...feeds.requested].sort()).toEqual(
      [FEED_URL.azure, FEED_URL.aws, endOfLifeUrlFor('azure-database-for-postgresql'), endOfLifeUrlFor('nodejs')].sort(),
    );
  });

  it('a hostile Azure feed is read in bounded time (kept as a guard)', () => {
    const azure = findProvider('Azure')!.statusFeed!;
    const start = performance.now();
    parseStatusFeed(azure, `<rss>${'<item><title>'.repeat(200_000)}`);
    parseStatusFeed(azure, `<rss><item><title>${'<'.repeat(1_000_000)}`);
    parseStatusFeed(azure, `<rss><item><title>${'<![CDATA['.repeat(100_000)}</title><description>${'&lt;'.repeat(300_000)}</description></item>`);
    parseStatusFeed(azure, `<rss>${`<item><title>t</title><description>${'a b '.repeat(50_000)}</description></item>`.repeat(60)}`);
    expect(performance.now() - start).toBeLessThan(2_000);
  });

  it('matching 40 rows against a full-size hostile AWS feed (200 events x 100 long names) does not block the server for seconds', () => {
    const aws = findProvider('AWS')!.statusFeed!;
    const long = (i: number) => `Amazon ${'Very Long Service Name Word '.repeat(3)}${i}`;
    const events = awsCurrentEvents(
      Array.from({length: 200}, (_, e) => ({region: `xx-east-${e}`, status: '3', service: long(e), impacted: Array.from({length: 100}, (_, i) => long(i))})),
    );
    // Inside every limit the reader sets: under the 4 MB cap, 200 incidents, 100 names of at most 200 characters.
    expect(Buffer.byteLength(events)).toBeLessThan(HOSTING_FEED_MAX_RESPONSE_BYTES);
    const incidents = parseStatusFeed(aws, events);
    const start = performance.now();
    for (let row = 0; row < 40; row++) {
      for (const incident of incidents) {
        incidentScope(incident, {components: ['Amazon Elastic Compute Cloud'], region: `us-east-${row}`});
      }
    }
    expect(performance.now() - start).toBeLessThan(2_000);
  });

  it('score maths: one incident on several rows counts once at its heaviest, floor 0, 79/80 and 94/95, null when nothing is checked (kept as a guard)', () => {
    const outage = {title: 'Down', impact: INCIDENT_IMPACT.major, scope: INCIDENT_SCOPE.service, url: null, startedAt: null};
    const base = {provider: 'AWS', service: 'EC2', version: null, runtime: null, runtimeVersion: null, endOfSupportOn: null, lastGoodCheckAt: NOW, healthError: null};
    const row = (extra: object) => ({...base, incidents: [], ...extra}) as HostingFacts;
    const health = (hosting: HostingFacts[], dependencies: DependencyFacts[] = []) => appHealth({hosting, dependencies, today: '2026-11-23'});
    expect(health([row({incidents: [outage]}), row({incidents: [{...outage, scope: INCIDENT_SCOPE.provider}]}), row({incidents: [outage, outage]})])).toMatchObject({score: 92, status: 'attention'});
    expect(health([row({endOfSupportOn: '2026-11-23'})]).score).toBe(88);
    expect(health([row({endOfSupportOn: '2026-11-22'})]).score).toBe(75);
    expect(health([row({endOfSupportOn: '2027-02-21'})]).score).toBe(88);
    expect(health([row({endOfSupportOn: '2027-02-22'})])).toMatchObject({score: 100, status: 'ok'});
    expect(health([row({endOfSupportOn: '2028-02-29'})], []).score).toBe(100);
    expect(health([row({incidents: [outage]}), row({endOfSupportOn: '2027-01-01'})])).toMatchObject({score: 80, status: 'attention'});
    expect(health([row({incidents: [{...outage, scope: INCIDENT_SCOPE.provider}]}), row({incidents: [{...outage, title: 'b', impact: INCIDENT_IMPACT.minor}]})])).toMatchObject({score: 94, status: 'attention'});
    expect(health(Array.from({length: 6}, () => row({endOfSupportOn: '2020-01-01'})))).toMatchObject({score: 0, status: 'critical'});
    expect(health([row({lastGoodCheckAt: null})])).toMatchObject({score: null, status: 'na'});
    // [31] A failed latest check keeps the last good reading, labelled stale (never ok); with no good reading there is no score.
    expect(health([row({healthError: 'AWS Health could not be reached'})])).toMatchObject({score: 100, status: 'stale'});
    expect(health([row({lastGoodCheckAt: null, healthError: 'AWS Health could not be reached'})])).toMatchObject({score: null, status: 'na', hasFailedCheck: true});
    expect(health([])).toMatchObject({score: null, status: 'na'});
  });

  it('an edit or a delete while a check is in flight wins, and the answer is dropped (kept as a guard)', async () => {
    const kept = await add({provider: 'AWS', service: 'RDS for PostgreSQL', region: 'us-east-1', version: '12'});
    const gone = await add({provider: 'AWS', service: 'S3'});
    const during: FetchText = async (url) => {
      if (url === RDS_PG) {
        await updateHosting(t.db, t.workspaceId, appId, kept.id, {endOfSupportOn: '2030-05-05'});
        await t.db.delete(appHosting).where(eq(appHosting.id, gone.id));
        return RDS_PG_DOC;
      }
      return NO_AWS_EVENTS;
    };
    const rows = await check(during);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({endOfSupportOn: '2030-05-05', endOfSupportSource: END_OF_SUPPORT_SOURCE.manual});
  });
});
