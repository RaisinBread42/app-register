import {eq} from 'drizzle-orm';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  ADVISORY_SEVERITY,
  ADVISORY_SOURCE,
  APP_KIND,
  END_OF_SUPPORT_SOURCE,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  MATCH_CONFIDENCE,
  NOTICE_ORIGIN,
  NOTICE_STATE,
} from '@/lib/constants';
import {appHosting} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {archiveApp, createApp} from './apps';
import {addDependency, removeDependency} from './dependencies';
import {replaceAdvisories} from './dependency-advisories';
import {addHosting, updateHosting} from './hosting';
import {replaceIncidents} from './hosting-incidents';
import {getNotice, listNotices, syncAppNotices, syncWorkspaceNotices} from './notices';
import {createPerson} from './people';

const TODAY = '2026-11-28';
const NOW = new Date('2026-11-28T09:00:00Z');
const LATER = new Date('2026-11-29T09:00:00Z');
const AWS_PAGE = 'https://health.aws.amazon.com/health/status';

describe('notices (adversarial review 76)', () => {
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

  async function withAdvisory(appId: string, packageName: string, advisory: {id: string; aliases?: string[]; summary?: string}) {
    const dependency = await addDependency(t.db, t.workspaceId, appId, {name: packageName, currentVersion: '1.0.0'});
    await replaceAdvisories(t.db, {id: dependency.id, workspaceId: t.workspaceId}, ADVISORY_SOURCE.osv, [
      {id: advisory.id, aliases: advisory.aliases ?? [], severity: ADVISORY_SEVERITY.critical, summary: advisory.summary ?? 'Remote code execution'},
    ]);
    return dependency;
  }

  it('F1 ?appId=A (open) must not return a notice whose match for A is resolved, only because app B still matches it', async () => {
    const a = await newApp('Portal');
    const b = await newApp('Intranet');
    const depA = await withAdvisory(a.id, 'left-pad', {id: 'GHSA-aaaa-bbbb-cccc'});
    await withAdvisory(b.id, 'left-pad', {id: 'GHSA-aaaa-bbbb-cccc'});
    await syncAppNotices(t.db, t.workspaceId, a.id, NOW, TODAY);
    await syncAppNotices(t.db, t.workspaceId, b.id, NOW, TODAY);
    await removeDependency(t.db, t.workspaceId, a.id, depA.id);

    const openForA = await listNotices(t.db, t.workspaceId, {appId: a.id});
    const resolvedForA = await listNotices(t.db, t.workspaceId, {appId: a.id, state: NOTICE_STATE.resolved});
    expect({open: openForA.length, resolved: resolvedForA.length}).toEqual({open: 0, resolved: 1});
  });

  it('F2 the same end-of-support notice keeps the origin of whichever app created it: a date a person set is labelled an outside claim', async () => {
    const looked = await newApp('Looked up');
    const byHand = await newApp('By hand');
    const lookedRow = await addHosting(t.db, t.workspaceId, looked.id, {provider: 'Azure', service: 'App Service', runtime: 'Node.js', runtimeVersion: '18'});
    // As the hosting check stores a looked-up date.
    await t.db
      .update(appHosting)
      .set({endOfSupportOn: '2025-04-30', endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate})
      .where(eq(appHosting.id, lookedRow.id));
    await addHosting(t.db, t.workspaceId, byHand.id, {provider: 'Azure', service: 'App Service', runtime: 'Node.js', runtimeVersion: '18', endOfSupportOn: '2025-04-30'});
    await syncAppNotices(t.db, t.workspaceId, looked.id, NOW, TODAY);
    await syncAppNotices(t.db, t.workspaceId, byHand.id, NOW, TODAY);

    const [noticeForByHand] = await listNotices(t.db, t.workspaceId, {appId: byHand.id});
    expect(noticeForByHand.matches.find((m) => m.app.id === byHand.id)?.matchReason).toMatch(/A person set/);
    expect(noticeForByHand.origin).toBe(NOTICE_ORIGIN.person);
  });

  it('F2b one app: a person sets the same date by hand that endoflife.date gave; the notice still says endoflife.date / external', async () => {
    const app = await newApp('Portal');
    const row = await addHosting(t.db, t.workspaceId, app.id, {provider: 'Azure', service: 'App Service', runtime: 'Node.js', runtimeVersion: '18'});
    await t.db
      .update(appHosting)
      .set({endOfSupportOn: '2025-04-30', endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate})
      .where(eq(appHosting.id, row.id));
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);
    await updateHosting(t.db, t.workspaceId, app.id, row.id, {endOfSupportOn: '2025-04-30'});

    const [notice] = await listNotices(t.db, t.workspaceId);
    expect(notice.matches[0].matchReason).toMatch(/A person set/);
    expect({origin: notice.origin, sourceUrl: notice.sourceUrl}).toEqual({origin: NOTICE_ORIGIN.person, sourceUrl: null});
  });

  it('F3 two hosting rows of one app on the same service in two regions: the high-confidence match is overwritten by the low one', async () => {
    const app = await newApp('Portal');
    const us = await addHosting(t.db, t.workspaceId, app.id, {provider: 'Azure', service: 'App Service', region: 'eastus'});
    const uk = await addHosting(t.db, t.workspaceId, app.id, {provider: 'Azure', service: 'App Service', region: 'uksouth'});
    const incident = {title: 'App Service errors in East US', impact: INCIDENT_IMPACT.major, url: null, startedAt: '2026-11-28T08:00:00.000Z'};
    await replaceIncidents(t.db, {id: us.id, workspaceId: t.workspaceId}, [{...incident, scope: INCIDENT_SCOPE.service}]);
    await replaceIncidents(t.db, {id: uk.id, workspaceId: t.workspaceId}, [{...incident, scope: INCIDENT_SCOPE.provider}]);
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);

    const [notice] = await listNotices(t.db, t.workspaceId);
    expect(notice.matches.map((m) => ({region: m.region, confidence: m.confidence}))).toContainEqual({region: 'eastus', confidence: MATCH_CONFIDENCE.high});
  });

  it('F5 two different AWS events that start in the same second collapse into one notice (every AWS link is the same page)', async () => {
    const app = await newApp('Portal');
    const row = await addHosting(t.db, t.workspaceId, app.id, {provider: 'AWS', service: 'Lambda', region: 'us-east-1'});
    const startedAt = '2026-11-28T08:00:00.000Z';
    await replaceIncidents(t.db, {id: row.id, workspaceId: t.workspaceId}, [
      {title: 'AWS Lambda: Increased error rates (N. Virginia)', impact: INCIDENT_IMPACT.major, scope: INCIDENT_SCOPE.service, url: AWS_PAGE, startedAt},
      {title: 'Amazon S3: Increased latency (N. Virginia)', impact: INCIDENT_IMPACT.minor, scope: INCIDENT_SCOPE.provider, url: AWS_PAGE, startedAt},
    ]);
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);

    expect((await listNotices(t.db, t.workspaceId)).map((n) => n.title).sort()).toEqual([
      'AWS Lambda: Increased error rates (N. Virginia)',
      'Amazon S3: Increased latency (N. Virginia)',
    ]);
  });

  it('F6 a whitespace-only OSV summary (stored as is) makes every sync throw, so the start-up backfill fails', async () => {
    const app = await newApp('Portal');
    await withAdvisory(app.id, 'left-pad', {id: 'GHSA-aaaa-bbbb-cccc', summary: ' '});
    await expect(syncWorkspaceNotices(t.db, t.workspaceId, NOW, TODAY)).resolves.toBe(1);
  });

  it('F7 advisory gone upstream, but an archived app still holds an open match: the notice is never resolved upstream', async () => {
    const active = await newApp('Portal');
    const archived = await newApp('Old portal');
    const dependency = await withAdvisory(active.id, 'left-pad', {id: 'GHSA-aaaa-bbbb-cccc'});
    await withAdvisory(archived.id, 'left-pad', {id: 'GHSA-aaaa-bbbb-cccc'});
    await syncWorkspaceNotices(t.db, t.workspaceId, NOW, TODAY);
    await archiveApp(t.db, t.workspaceId, archived.id);
    // OSV stops reporting it.
    await replaceAdvisories(t.db, {id: dependency.id, workspaceId: t.workspaceId}, ADVISORY_SOURCE.osv, []);
    await syncWorkspaceNotices(t.db, t.workspaceId, LATER, TODAY);

    const [resolved] = await listNotices(t.db, t.workspaceId, {state: NOTICE_STATE.resolved});
    const notice = await getNotice(t.db, t.workspaceId, resolved.id);
    expect(notice.matches.every((m) => m.resolvedAt !== null)).toBe(true);
    expect(notice.resolvedUpstreamAt).toEqual(LATER);
  });

});
