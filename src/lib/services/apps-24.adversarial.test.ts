import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  ADVISORY_SEVERITY,
  ADVISORY_SOURCE,
  APP_KIND,
  APPLICATIONS_REGISTER_SCOPES,
  AUDIT_ACTION,
  MATCH_STATUS,
  PERSON_STATUS,
} from '@/lib/constants';
import {callApi} from '@/lib/api/test/client';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {setupChecklist} from '@/lib/ui/setup-checklist';
import type {AppDetail} from '@/lib/ui/api-client';
import {createApiKey} from './api-keys';
import {archiveApp, createApp, getApp, listActiveApps, unarchiveApp} from './apps';
import {addDependency} from './dependencies';
import {replaceAdvisories} from './dependency-advisories';
import {addHosting} from './hosting';
import {assignMatch, changeMatchStatus, listAuditEvents, undoLastAction} from './notice-actions';
import {getMatch, listNotices, syncAppNotices} from './notices';
import {createPerson, updatePerson} from './people';

/** Adversarial review of [24]: archive, Undo / unarchive, the setup checklist. */

const TODAY = '2026-11-28';
const NOW = new Date('2026-11-28T09:00:00Z');
const ACTOR = {name: 'API key "Adv"', keyId: null};

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

describe('adversarial [24] archive / unarchive', () => {
  let ownerId: string;
  let appId: string;
  let matchId: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Avery', email: 'avery@example.test'})).id;
    appId = (await createApp(t.db, t.workspaceId, {name: 'Portal', kind: APP_KIND.inHouse, ownerId})).id;
    const dependency = await addDependency(t.db, t.workspaceId, appId, {name: 'left-pad', currentVersion: '1.0.0'});
    await replaceAdvisories(t.db, {id: dependency.id, workspaceId: t.workspaceId}, ADVISORY_SOURCE.osv, [
      {id: 'GHSA-aaaa-bbbb-cccc', aliases: [], severity: ADVISORY_SEVERITY.critical, summary: 'Remote code execution'},
    ]);
    await syncAppNotices(t.db, t.workspaceId, appId, NOW, TODAY);
    matchId = (await listNotices(t.db, t.workspaceId))[0].matches[0].id;
  });
  afterEach(async () => {
    await t.client.close();
  });

  it('ADV-U1 archive then Undo leaves a handled notice handled, with its evidence, and records no "source reports it again"', async () => {
    await changeMatchStatus(t.db, t.workspaceId, matchId, {status: MATCH_STATUS.handled, note: 'Patched in PR 42'}, ACTOR, NOW, TODAY);

    await archiveApp(t.db, t.workspaceId, appId, ACTOR);
    await unarchiveApp(t.db, t.workspaceId, appId, ACTOR, TODAY); // the Undo, seconds later

    const match = await getMatch(t.db, t.workspaceId, matchId);
    const events = await listAuditEvents(t.db, t.workspaceId, {matchId});
    console.log('ADV-U1 after Undo:', {status: match.status, statusNote: match.statusNote}, events.map((e) => [e.action, e.actor, e.note]));
    expect.soft(match.status, 'status after archive → Undo').toBe(MATCH_STATUS.handled);
    expect.soft(match.statusNote, 'handled evidence after archive → Undo').toBe('Patched in PR 42');
    expect.soft(events.map((e) => e.action), 'no System reopen caused by the Undo').not.toContain(AUDIT_ACTION.noticeReopened);
    // And the person cannot take it back: the latest event is not theirs.
    await expect.soft(undoLastAction(t.db, t.workspaceId, matchId, ACTOR, {}, NOW, TODAY), 'undo of the reopen').resolves.toBeUndefined();
  });

  it('ADV-U2 (control) a reviewing, assigned notice comes back reviewing and assigned after archive → unarchive', async () => {
    await changeMatchStatus(t.db, t.workspaceId, matchId, {status: MATCH_STATUS.reviewing}, ACTOR, NOW, TODAY);
    await assignMatch(t.db, t.workspaceId, matchId, {assigneeId: ownerId}, ACTOR, NOW);
    await archiveApp(t.db, t.workspaceId, appId, ACTOR);
    await unarchiveApp(t.db, t.workspaceId, appId, ACTOR, TODAY);
    const match = await getMatch(t.db, t.workspaceId, matchId);
    expect(match).toMatchObject({status: MATCH_STATUS.reviewing, resolvedAt: null});
    expect(match.assignee?.id).toBe(ownerId);
  });

  it('ADV-U3 (characterisation) a repeated Undo with the same key after the app was archived again answers 200 while the app is archived', async () => {
    const key = (await createApiKey(t.db, t.workspaceId, 'Adv full')).key;
    const undoKey = crypto.randomUUID();
    await callApi(key, 'POST', `/api/apps/${appId}/archive`);
    const first = await callApi(key, 'POST', `/api/apps/${appId}/unarchive`, {idempotencyKey: undoKey});
    expect(first.body.app.archivedAt).toBeNull();
    await callApi(key, 'POST', `/api/apps/${appId}/archive`);
    const repeat = await callApi(key, 'POST', `/api/apps/${appId}/unarchive`, {idempotencyKey: undoKey});
    console.log('ADV-U3 repeat Undo:', repeat.status, 'archivedAt =', repeat.body.app.archivedAt);
    // The UI (undoArchive / ArchivedTable.restore) treats any 2xx as "<name> is active again".
    expect(repeat.status).toBe(200);
    expect(repeat.body.app.archivedAt).not.toBeNull();
  });

  it('ADV-U4 a scoped (Settings) key cannot unarchive, but can list archived apps; another workspace id is 404', async () => {
    const scoped = (await createApiKey(t.db, t.workspaceId, 'Adv scoped', {scopes: APPLICATIONS_REGISTER_SCOPES})).key;
    const full = (await createApiKey(t.db, t.workspaceId, 'Adv full')).key;
    await callApi(full, 'POST', `/api/apps/${appId}/archive`);
    expect((await callApi(scoped, 'POST', `/api/apps/${appId}/unarchive`)).status).toBe(403);
    const listed = await callApi(scoped, 'GET', '/api/apps?state=archived');
    expect(listed.body.apps.map((app: {id: string}) => app.id)).toEqual([appId]);
    expect((await callApi(full, 'POST', `/api/apps/00000000-0000-4000-8000-000000000000/unarchive`)).status).toBe(404);
    expect((await callApi(full, 'POST', `/api/apps/not-a-uuid/unarchive`)).status).toBe(404);
    expect((await callApi(full, 'GET', '/api/apps?state=Archived')).status).toBe(400);
  });

  it('ADV-U5 (characterisation) state=archived silently ignores an invalid kind that the active list refuses', async () => {
    const full = (await createApiKey(t.db, t.workspaceId, 'Adv full')).key;
    expect((await callApi(full, 'GET', '/api/apps?kind=spaceship')).status).toBe(400);
    expect((await callApi(full, 'GET', '/api/apps?state=archived&kind=spaceship&sort=bogus')).status).toBe(200);
  });

  it('ADV-U6 unarchiving an app whose owner left meanwhile brings it back owned by a leaver, silently', async () => {
    await archiveApp(t.db, t.workspaceId, appId, ACTOR);
    await updatePerson(t.db, t.workspaceId, ownerId, {status: PERSON_STATUS.left, leftOn: TODAY});
    await unarchiveApp(t.db, t.workspaceId, appId, ACTOR, TODAY);
    const active = await listActiveApps(t.db, t.workspaceId);
    console.log('ADV-U6 active after unarchive:', active.map((app) => [app.name, app.owner.name]));
    expect(active.map((app) => app.id)).toEqual([appId]);
  });
});

describe('adversarial [24] setup checklist claims', () => {
  let ownerId: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Avery', email: 'avery@example.test'})).id;
  });
  afterEach(async () => {
    await t.client.close();
  });

  it('ADV-U7 "First check by a source" is not ticked off for an app no source has checked (only a hand-typed end-of-support date)', async () => {
    const app = await createApp(t.db, t.workspaceId, {name: 'Ledger', kind: APP_KIND.inHouse, ownerId, repositoryUrl: 'https://git.example.test/ledger'});
    await addHosting(t.db, t.workspaceId, app.id, {provider: 'On-prem rack', service: 'VM', endOfSupportOn: '2026-12-15'});
    const detail = (await getApp(t.db, t.workspaceId, app.id, TODAY)) as unknown as AppDetail;
    const firstCheck = setupChecklist(detail).find((item) => item.key === 'first_check');
    console.log('ADV-U7 hosting:', detail.hosting.map((row) => ({isMonitored: row.isMonitored, healthCheckedAt: row.healthCheckedAt, status: row.status})), 'score:', detail.health.score, 'firstCheck:', firstCheck);
    expect(detail.hosting.every((row) => row.healthCheckedAt === null)).toBe(true);
    expect(firstCheck?.isDone, 'first check by a source, with no source check').toBe(false);
  });
});
