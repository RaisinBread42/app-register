import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  ADVISORY_SEVERITY,
  ADVISORY_SOURCE,
  APP_KIND,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  MATCH_CONFIDENCE,
  NOTICE_CATEGORY,
  NOTICE_ORIGIN,
  NOTICE_SEVERITY,
  NOTICE_SOURCE,
} from '@/lib/constants';
import {appNoticeMatches, notices} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {archiveApp, createApp} from './apps';
import {addDependency, removeDependency} from './dependencies';
import {replaceAdvisories} from './dependency-advisories';
import {addHosting, removeHosting} from './hosting';
import {replaceIncidents} from './hosting-incidents';
import {getNotice, listNotices, syncAppNotices} from './notices';
import {createPerson} from './people';

const TODAY = '2026-11-28';
const NOW = new Date('2026-11-28T09:00:00Z');
const LATER = new Date('2026-11-29T09:00:00Z');

describe('notices', () => {
  let t: TestDb;
  let ownerId: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Owner', email: 'owner@example.test'})).id;
  });
  afterEach(async () => {
    await t.client.close();
  });

  const newApp = (name: string) => createApp(t.db, t.workspaceId, {name, kind: APP_KIND.inHouse, ownerId});

  async function withAdvisory(appId: string, packageName: string, advisoryId: string) {
    const dependency = await addDependency(t.db, t.workspaceId, appId, {name: packageName, currentVersion: '1.0.0'});
    await replaceAdvisories(t.db, {id: dependency.id, workspaceId: t.workspaceId}, ADVISORY_SOURCE.osv, [
      {id: advisoryId, aliases: [], severity: ADVISORY_SEVERITY.critical, summary: 'Remote code execution'},
    ]);
    return dependency;
  }

  async function withHosting(appId: string, values: {region?: string; runtimeVersion?: string; endOfSupportOn?: string}) {
    return addHosting(t.db, t.workspaceId, appId, {provider: 'Azure', service: 'App Service', runtime: 'Node.js', ...values});
  }

  it('an advisory OSV found becomes one security notice with its source, matched to the app with the reason and high confidence', async () => {
    const app = await newApp('Portal');
    await withAdvisory(app.id, 'left-pad', 'GHSA-aaaa-bbbb-cccc');
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);

    const [notice] = await listNotices(t.db, t.workspaceId);
    expect(notice).toMatchObject({
      category: NOTICE_CATEGORY.security,
      severity: NOTICE_SEVERITY.critical,
      source: NOTICE_SOURCE.osv,
      origin: NOTICE_ORIGIN.external,
      externalId: 'GHSA-aaaa-bbbb-cccc',
      sourceUrl: expect.stringContaining('GHSA-aaaa-bbbb-cccc'),
    });
    expect(notice.matches).toEqual([
      expect.objectContaining({app: {id: app.id, name: 'Portal'}, component: 'left-pad', version: '1.0.0', confidence: MATCH_CONFIDENCE.high, matchReason: expect.stringContaining('left-pad 1.0.0')}),
    ]);
  });

  it('a repeat check updates the notice instead of adding another, and the same advisory on two apps is one notice with two matches', async () => {
    const first = await newApp('Portal');
    const second = await newApp('Intranet');
    await withAdvisory(first.id, 'left-pad', 'GHSA-aaaa-bbbb-cccc');
    await withAdvisory(second.id, 'left-pad', 'GHSA-aaaa-bbbb-cccc');
    await syncAppNotices(t.db, t.workspaceId, first.id, NOW, TODAY);
    await syncAppNotices(t.db, t.workspaceId, second.id, NOW, TODAY);
    await syncAppNotices(t.db, t.workspaceId, first.id, LATER, TODAY);

    expect(await t.db.select().from(notices)).toHaveLength(1);
    const [notice] = await listNotices(t.db, t.workspaceId);
    expect(notice.matches.map((match) => match.app.name).sort()).toEqual(['Intranet', 'Portal']);
    expect(notice.firstSeenAt).toEqual(NOW);
    expect(notice.lastSeenAt).toEqual(LATER);
  });

  it('when the source stops reporting an advisory the notice is resolved upstream, but the notice and its match stay as history', async () => {
    const app = await newApp('Portal');
    const dependency = await withAdvisory(app.id, 'left-pad', 'GHSA-aaaa-bbbb-cccc');
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);
    await replaceAdvisories(t.db, {id: dependency.id, workspaceId: t.workspaceId}, ADVISORY_SOURCE.osv, []);
    await syncAppNotices(t.db, t.workspaceId, app.id, LATER, TODAY);

    expect(await listNotices(t.db, t.workspaceId)).toEqual([]);
    const [resolved] = await listNotices(t.db, t.workspaceId, {state: 'resolved'});
    expect(resolved.resolvedUpstreamAt).toEqual(LATER);
    expect(resolved.matches[0].resolvedAt).toEqual(LATER);
    expect(resolved.firstSeenAt).toEqual(NOW);
  });

  it('a dependency an app does not have can never give that app a notice (spec §8 check 21)', async () => {
    const affected = await newApp('Portal');
    const other = await newApp('Intranet');
    await addDependency(t.db, t.workspaceId, other.id, {name: 'react', currentVersion: '19.3.1'});
    await withAdvisory(affected.id, 'left-pad', 'GHSA-aaaa-bbbb-cccc');
    await syncAppNotices(t.db, t.workspaceId, affected.id, NOW, TODAY);
    await syncAppNotices(t.db, t.workspaceId, other.id, NOW, TODAY);

    expect(await listNotices(t.db, t.workspaceId, {appId: other.id})).toEqual([]);
    expect(await listNotices(t.db, t.workspaceId, {appId: affected.id})).toHaveLength(1);
  });

  it('a provider incident that does not name the app\'s service or region is only a low-confidence match (spec §8 check 22)', async () => {
    const app = await newApp('Portal');
    const hosting = await withHosting(app.id, {region: 'uksouth'});
    await replaceIncidents(t.db, {id: hosting.id, workspaceId: t.workspaceId}, [
      {title: 'Storage degraded in East US', impact: INCIDENT_IMPACT.major, scope: INCIDENT_SCOPE.provider, url: null, startedAt: null},
      {title: 'App Service errors in UK South', impact: INCIDENT_IMPACT.major, scope: INCIDENT_SCOPE.service, url: null, startedAt: null},
    ]);
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);

    const byTitle = Object.fromEntries((await listNotices(t.db, t.workspaceId)).map((notice) => [notice.title, notice]));
    expect(byTitle['Storage degraded in East US'].matches[0].confidence).toBe(MATCH_CONFIDENCE.low);
    expect(byTitle['App Service errors in UK South'].matches[0].confidence).toBe(MATCH_CONFIDENCE.high);
    expect(byTitle['App Service errors in UK South'].category).toBe(NOTICE_CATEGORY.outage);
  });

  it('end of support: past is high, within 90 days is medium, further out is no notice; a date set by a person is labelled as theirs', async () => {
    const past = await newApp('Past');
    const soon = await newApp('Soon');
    const later = await newApp('Later');
    await withHosting(past.id, {runtimeVersion: '18', endOfSupportOn: '2025-04-30'});
    await withHosting(soon.id, {runtimeVersion: '20', endOfSupportOn: '2027-01-15'});
    await withHosting(later.id, {runtimeVersion: '24', endOfSupportOn: '2028-04-30'});
    for (const app of [past, soon, later]) {
      await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);
    }

    const [pastNotice] = await listNotices(t.db, t.workspaceId, {appId: past.id});
    expect(pastNotice).toMatchObject({category: NOTICE_CATEGORY.lifecycle, severity: NOTICE_SEVERITY.high, dueOn: '2025-04-30', origin: NOTICE_ORIGIN.person, source: NOTICE_SOURCE.manual});
    expect((await listNotices(t.db, t.workspaceId, {appId: soon.id}))[0].severity).toBe(NOTICE_SEVERITY.medium);
    expect(await listNotices(t.db, t.workspaceId, {appId: later.id})).toEqual([]);
  });

  it('an advisory id a person recorded is a notice labelled as entered by a person, unrated until a source rates it', async () => {
    const app = await newApp('Portal');
    await addDependency(t.db, t.workspaceId, app.id, {name: 'left-pad', currentVersion: '1.0.0', vulnerabilities: ['CVE-2026-0001']});
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);

    const [notice] = await listNotices(t.db, t.workspaceId);
    expect(notice).toMatchObject({origin: NOTICE_ORIGIN.person, source: NOTICE_SOURCE.manual, severity: NOTICE_SEVERITY.unknown, externalId: 'CVE-2026-0001'});
  });

  it('removing a dependency resolves its notices for that app; archiving the app hides its notices', async () => {
    const app = await newApp('Portal');
    const dependency = await withAdvisory(app.id, 'left-pad', 'GHSA-aaaa-bbbb-cccc');
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);
    await removeDependency(t.db, t.workspaceId, app.id, dependency.id);
    expect(await listNotices(t.db, t.workspaceId)).toEqual([]);
    expect(await t.db.select().from(appNoticeMatches)).toHaveLength(1);

    const archived = await newApp('Archived');
    await withAdvisory(archived.id, 'is-odd', 'GHSA-dddd-eeee-ffff');
    await syncAppNotices(t.db, t.workspaceId, archived.id, NOW, TODAY);
    await archiveApp(t.db, t.workspaceId, archived.id);
    expect(await listNotices(t.db, t.workspaceId, {state: 'all'})).toHaveLength(1);
  });

  it('filters are checked: an unknown severity is refused, and another workspace\'s notice is a 404', async () => {
    await expect(listNotices(t.db, t.workspaceId, {severity: 'apocalyptic'})).rejects.toThrow(/severity must be one of/);
    const app = await newApp('Portal');
    await withAdvisory(app.id, 'left-pad', 'GHSA-aaaa-bbbb-cccc');
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);
    const [notice] = await listNotices(t.db, t.workspaceId);
    expect((await getNotice(t.db, t.workspaceId, notice.id)).id).toBe(notice.id);
    await expect(getNotice(t.db, crypto.randomUUID(), notice.id)).rejects.toThrow(/Notice not found/);
  });

  it('removing a hosting row by hand resolves its notices straight away, without waiting for a check', async () => {
    const app = await newApp('Portal');
    const hosting = await withHosting(app.id, {runtimeVersion: '18', endOfSupportOn: '2025-04-30'});
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);
    expect(await listNotices(t.db, t.workspaceId)).toHaveLength(1);
    await removeHosting(t.db, t.workspaceId, app.id, hosting.id);
    expect(await listNotices(t.db, t.workspaceId)).toEqual([]);
  });
});
