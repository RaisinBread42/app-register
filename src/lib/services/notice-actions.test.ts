import {eq} from 'drizzle-orm';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  ACTOR_SYSTEM,
  ADVISORY_SEVERITY,
  ADVISORY_SOURCE,
  APP_KIND,
  AUDIT_ACTION,
  MATCH_STATUS,
  NOTICE_SEVERITY,
  PERSON_STATUS,
} from '@/lib/constants';
import {callApi} from '@/lib/api/test/client';
import {newId} from '@/lib/db/ids';
import {auditEvents, workspaces} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from './api-keys';
import {createApp} from './apps';
import {addDependency} from './dependencies';
import {replaceAdvisories} from './dependency-advisories';
import {assignMatch, changeMatchStatus, endExpiredSnoozes, listAuditEvents, undoLastAction} from './notice-actions';
import {getMatch, listNotices, syncAppNotices} from './notices';
import {createPerson, updatePerson} from './people';

const TODAY = '2026-11-28';
const NOW = new Date('2026-11-28T09:00:00Z');
const ACTOR = 'API key "Test"';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

describe('notice actions and audit history', () => {
  let ownerId: string;
  let matchId: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Avery', email: 'avery@example.test'})).id;
    const app = await createApp(t.db, t.workspaceId, {name: 'Portal', kind: APP_KIND.inHouse, ownerId});
    const dependency = await addDependency(t.db, t.workspaceId, app.id, {name: 'left-pad', currentVersion: '1.0.0'});
    await replaceAdvisories(t.db, {id: dependency.id, workspaceId: t.workspaceId}, ADVISORY_SOURCE.osv, [
      {id: 'GHSA-aaaa-bbbb-cccc', aliases: [], severity: ADVISORY_SEVERITY.critical, summary: 'Remote code execution'},
    ]);
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);
    matchId = (await listNotices(t.db, t.workspaceId))[0].matches[0].id;
  });
  afterEach(async () => {
    vi.useRealTimers();
    await t.client.close();
  });

  const status = (change: {status: string; note?: string; snoozedUntil?: string}) =>
    changeMatchStatus(t.db, t.workspaceId, matchId, change, ACTOR, NOW, TODAY);

  it('a notice moves through reviewing, snoozed (date and reason required), handled (evidence required) and back to new', async () => {
    await status({status: MATCH_STATUS.reviewing});
    expect((await getMatch(t.db, t.workspaceId, matchId)).status).toBe(MATCH_STATUS.reviewing);

    await expect(status({status: MATCH_STATUS.snoozed, note: 'Waiting on vendor'})).rejects.toThrow(/date after today/);
    await expect(status({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-15'})).rejects.toThrow(/needs a reason/);
    await status({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-15', note: 'Waiting on vendor fix'});
    expect(await getMatch(t.db, t.workspaceId, matchId)).toMatchObject({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-15', statusNote: 'Waiting on vendor fix'});

    await expect(status({status: MATCH_STATUS.handled})).rejects.toThrow(/evidence/);
    await status({status: MATCH_STATUS.handled, note: 'Upgraded to 1.0.1 in PR 42'});
    expect(await getMatch(t.db, t.workspaceId, matchId)).toMatchObject({status: MATCH_STATUS.handled, snoozedUntil: null});

    await status({status: MATCH_STATUS.new});
    expect((await getMatch(t.db, t.workspaceId, matchId)).status).toBe(MATCH_STATUS.new);
  });

  it('changing the status never changes the severity: a handled critical notice is still critical', async () => {
    await status({status: MATCH_STATUS.handled, note: 'Patched'});
    const [notice] = await listNotices(t.db, t.workspaceId);
    expect(notice.severity).toBe(NOTICE_SEVERITY.critical);
    expect(notice.matches[0].status).toBe(MATCH_STATUS.handled);
  });

  it('a notice can be assigned to an active person with a note, and cleared; a person who left cannot be assigned', async () => {
    await assignMatch(t.db, t.workspaceId, matchId, {assigneeId: ownerId, note: 'Please look'}, ACTOR, NOW);
    expect((await getMatch(t.db, t.workspaceId, matchId)).assignee).toEqual({id: ownerId, name: 'Avery'});
    await assignMatch(t.db, t.workspaceId, matchId, {assigneeId: null}, ACTOR, NOW);
    expect((await getMatch(t.db, t.workspaceId, matchId)).assignee).toBeNull();

    const leaver = await createPerson(t.db, t.workspaceId, {name: 'Gone', email: 'gone@example.test'});
    await updatePerson(t.db, t.workspaceId, leaver.id, {status: PERSON_STATUS.left, leftOn: TODAY});
    await expect(assignMatch(t.db, t.workspaceId, matchId, {assigneeId: leaver.id}, ACTOR, NOW)).rejects.toThrow();
  });

  it('every action appends an audit event with who, what, when, before, after and note, and the history cannot be changed', async () => {
    await status({status: MATCH_STATUS.reviewing});
    await status({status: MATCH_STATUS.handled, note: 'Patched'});
    const events = await listAuditEvents(t.db, t.workspaceId, {matchId});
    expect(events.map((event) => [event.action, event.fromValue, event.toValue, event.note, event.actor])).toEqual([
      [AUDIT_ACTION.noticeStatusChanged, MATCH_STATUS.reviewing, MATCH_STATUS.handled, 'Patched', ACTOR],
      [AUDIT_ACTION.noticeStatusChanged, MATCH_STATUS.new, MATCH_STATUS.reviewing, null, ACTOR],
    ]);
    await expect(t.db.update(auditEvents).set({note: 'rewritten'}).where(eq(auditEvents.id, events[0].id))).rejects.toThrow();
  });

  it('a snooze reads as new once its date comes, and the daily job records that it ended', async () => {
    await status({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-01', note: 'Change freeze'});
    vi.useFakeTimers({toFake: ['Date'], now: new Date('2026-12-02T09:00:00Z')});
    expect((await getMatch(t.db, t.workspaceId, matchId)).status).toBe(MATCH_STATUS.new);

    expect(await endExpiredSnoozes(t.db, t.workspaceId, new Date('2026-12-02T09:00:00Z'), '2026-12-02')).toBe(1);
    const [latest] = await listAuditEvents(t.db, t.workspaceId, {matchId});
    expect(latest).toMatchObject({action: AUDIT_ACTION.noticeSnoozeEnded, actor: ACTOR_SYSTEM, toValue: MATCH_STATUS.new});
  });

  it('undo restores the previous status (and a snooze still ahead) with a new event; the original event stays', async () => {
    await status({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-15', note: 'Waiting'});
    await status({status: MATCH_STATUS.handled, note: 'Fixed'});
    await undoLastAction(t.db, t.workspaceId, matchId, ACTOR, NOW, TODAY);
    expect(await getMatch(t.db, t.workspaceId, matchId)).toMatchObject({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-15'});
    const actions = (await listAuditEvents(t.db, t.workspaceId, {matchId})).map((event) => event.action);
    expect(actions).toEqual([AUDIT_ACTION.noticeUndone, AUDIT_ACTION.noticeStatusChanged, AUDIT_ACTION.noticeStatusChanged]);
    await expect(undoLastAction(t.db, t.workspaceId, matchId, ACTOR, NOW, TODAY)).rejects.toThrow(/nothing to undo/);
  });

  it('a later check of the source never overwrites what people decided', async () => {
    await status({status: MATCH_STATUS.handled, note: 'Accepted risk until upgrade'});
    const appId = (await getMatch(t.db, t.workspaceId, matchId)).app.id;
    await syncAppNotices(t.db, t.workspaceId, appId, new Date('2026-11-29T09:00:00Z'), TODAY);
    expect(await getMatch(t.db, t.workspaceId, matchId)).toMatchObject({status: MATCH_STATUS.handled, statusNote: 'Accepted risk until upgrade'});
  });

  it('the API needs an Idempotency-Key, records the API key as the actor, and another workspace gets 404', async () => {
    const key = (await createApiKey(t.db, t.workspaceId, 'Inbox')).key;
    const path = `/api/notice-matches/${matchId}/status`;
    expect((await callApi(key, 'POST', path, {body: {status: MATCH_STATUS.reviewing}, idempotencyKey: null})).status).toBe(400);
    const done = await callApi(key, 'POST', path, {body: {status: MATCH_STATUS.reviewing}});
    expect(done.status).toBe(200);
    expect(done.body.match.status).toBe(MATCH_STATUS.reviewing);
    const events = await callApi(key, 'GET', `/api/audit-events?matchId=${matchId}`);
    expect(events.body.events[0].actor).toBe('API key "Inbox"');

    const otherWorkspace = newId();
    await t.db.insert(workspaces).values({id: otherWorkspace, name: 'Other', slug: 'other'});
    const otherKey = (await createApiKey(t.db, otherWorkspace, 'Other')).key;
    expect((await callApi(otherKey, 'POST', path, {body: {status: MATCH_STATUS.handled, note: 'x'}})).status).toBe(404);
    expect((await callApi(otherKey, 'POST', `/api/notice-matches/${matchId}/undo`)).status).toBe(404);
  });
});
