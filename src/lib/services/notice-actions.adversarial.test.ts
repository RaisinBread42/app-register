import {eq} from 'drizzle-orm';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ADVISORY_SEVERITY, ADVISORY_SOURCE, APP_KIND, AUDIT_ACTION, MATCH_STATUS, PERSON_STATUS} from '@/lib/constants';
import {callApi} from '@/lib/api/test/client';
import {auditEvents} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from './api-keys';
import {archiveApp, createApp} from './apps';
import {addDependency} from './dependencies';
import {replaceAdvisories} from './dependency-advisories';
import {assignMatch, changeMatchStatus, endExpiredSnoozes, listAuditEvents, undoLastAction} from './notice-actions';
import {getMatch, listNotices, syncAppNotices} from './notices';
import {createPerson, updatePerson} from './people';

const TODAY = '2026-11-28';
const NOW = new Date('2026-11-28T09:00:00Z');
const LATER_DAY = '2026-12-02';
const LATER = new Date('2026-12-02T09:00:00Z');
const ACTOR = {name: 'API key "Test"', keyId: null};

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

describe('adversarial: notice actions [26]', () => {
  let ownerId: string;
  let appId: string;
  let matchId: string;
  let secondMatchId: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Avery', email: 'avery@example.test'})).id;
    appId = (await createApp(t.db, t.workspaceId, {name: 'Portal', kind: APP_KIND.inHouse, ownerId})).id;
    for (const [name, advisory] of [['left-pad', 'GHSA-aaaa-bbbb-cccc'], ['right-pad', 'GHSA-dddd-eeee-ffff']]) {
      const dependency = await addDependency(t.db, t.workspaceId, appId, {name, currentVersion: '1.0.0'});
      await replaceAdvisories(t.db, {id: dependency.id, workspaceId: t.workspaceId}, ADVISORY_SOURCE.osv, [
        {id: advisory, aliases: [], severity: ADVISORY_SEVERITY.critical, summary: `Bug in ${name}`},
      ]);
    }
    await syncAppNotices(t.db, t.workspaceId, appId, NOW, TODAY);
    const ids = (await listNotices(t.db, t.workspaceId)).flatMap((notice) => notice.matches.map((match) => match.id));
    [matchId, secondMatchId] = ids;
  });
  afterEach(async () => {
    vi.useRealTimers();
    await t.client.close();
  });

  const status = (change: {status: string; note?: string; snoozedUntil?: string}, now = NOW, today = TODAY, id = matchId) =>
    changeMatchStatus(t.db, t.workspaceId, id, change, ACTOR, now, today);

  it('F1 undo after the daily job ended a snooze does not move the match to a status it was not in', async () => {
    await status({status: MATCH_STATUS.reviewing});
    await status({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-01', note: 'Change freeze'});
    await endExpiredSnoozes(t.db, t.workspaceId, LATER, LATER_DAY);
    expect((await getMatch(t.db, t.workspaceId, matchId)).status).toBe(MATCH_STATUS.new);

    // The latest change is the snooze ending; undoing it would bring back an ended snooze, so it must be refused.
    await undoLastAction(t.db, t.workspaceId, matchId, ACTOR, {}, LATER, LATER_DAY).catch(() => undefined);
    expect((await getMatch(t.db, t.workspaceId, matchId)).status).toBe(MATCH_STATUS.new);
  });

  it('F2 undo restores the snooze date and reason that were in place, not ones a person already undid', async () => {
    await status({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-10', note: 'Change freeze'});
    await status({status: MATCH_STATUS.snoozed, snoozedUntil: '2036-12-10', note: 'typo, wrong year'});
    await undoLastAction(t.db, t.workspaceId, matchId, ACTOR, {}, NOW, TODAY);
    expect(await getMatch(t.db, t.workspaceId, matchId)).toMatchObject({snoozedUntil: '2026-12-10', statusNote: 'Change freeze'});

    await status({status: MATCH_STATUS.reviewing});
    await undoLastAction(t.db, t.workspaceId, matchId, ACTOR, {}, NOW, TODAY);
    expect(await getMatch(t.db, t.workspaceId, matchId)).toMatchObject({
      status: MATCH_STATUS.snoozed,
      snoozedUntil: '2026-12-10',
      statusNote: 'Change freeze',
    });
  });

  it('F3 undo reverses the action that was applied last, not the one with the latest clock reading', async () => {
    // `now` is read before the row lock (and, for assign, before an extra query), and app instances
    // have their own clocks: a change applied second can carry an earlier occurredAt.
    await status({status: MATCH_STATUS.reviewing}, new Date('2026-11-28T09:00:00.500Z'));
    await status({status: MATCH_STATUS.handled, note: 'Patched in PR 42'}, new Date('2026-11-28T09:00:00.100Z'));
    expect((await getMatch(t.db, t.workspaceId, matchId)).status).toBe(MATCH_STATUS.handled);

    // Undo of the latest action (handled) must go back to reviewing.
    await undoLastAction(t.db, t.workspaceId, matchId, ACTOR, {}, LATER, LATER_DAY);
    expect((await getMatch(t.db, t.workspaceId, matchId)).status).toBe(MATCH_STATUS.reviewing);
  });

  it('F4 paging with before does not skip events that share a timestamp', async () => {
    await status({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-01', note: 'Freeze'});
    await status({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-01', note: 'Freeze'}, NOW, TODAY, secondMatchId);
    await endExpiredSnoozes(t.db, t.workspaceId, LATER, LATER_DAY);
    const key = (await createApiKey(t.db, t.workspaceId, 'Inbox')).key;

    const all = (await callApi(key, 'GET', '/api/audit-events')).body.events.map((event: {id: string}) => event.id);
    const page1 = (await callApi(key, 'GET', '/api/audit-events?limit=1')).body.events;
    const page2 = (await callApi(key, 'GET', `/api/audit-events?before=${page1[0].id}`)).body.events;
    expect([...page1, ...page2].map((event: {id: string}) => event.id)).toEqual(all);
  });

  it('F5 undo never brings back an assignee who has since left', async () => {
    const leaver = (await createPerson(t.db, t.workspaceId, {name: 'Gone', email: 'gone@example.test'})).id;
    await assignMatch(t.db, t.workspaceId, matchId, {assigneeId: leaver}, ACTOR, NOW);
    await assignMatch(t.db, t.workspaceId, matchId, {assigneeId: ownerId}, ACTOR, NOW);
    await updatePerson(t.db, t.workspaceId, leaver, {status: PERSON_STATUS.left, leftOn: TODAY});

    await undoLastAction(t.db, t.workspaceId, matchId, ACTOR, {}, LATER, LATER_DAY).catch(() => undefined);
    expect((await getMatch(t.db, t.workspaceId, matchId)).assignee?.id).not.toBe(leaver);
  });

  it('F6 an assign body without assigneeId (or with a typo) is a 400, not a silent unassign', async () => {
    await assignMatch(t.db, t.workspaceId, matchId, {assigneeId: ownerId}, ACTOR, NOW);
    const key = (await createApiKey(t.db, t.workspaceId, 'Inbox')).key;
    const typo = await callApi(key, 'POST', `/api/notice-matches/${matchId}/assign`, {body: {assigneeID: ownerId}});
    expect({status: typo.status, assignee: (await getMatch(t.db, t.workspaceId, matchId)).assignee?.id ?? null}).toEqual({
      status: 400,
      assignee: ownerId,
    });
  });

  it('F7 acting on a notice of an archived app is refused like every other write to an archived app', async () => {
    await archiveApp(t.db, t.workspaceId, appId);
    const key = (await createApiKey(t.db, t.workspaceId, 'Inbox')).key;
    const response = await callApi(key, 'POST', `/api/notice-matches/${matchId}/status`, {body: {status: MATCH_STATUS.reviewing}});
    expect(response.status).toBe(404);
  });

  it('F8 acting on a snooze that has come records the status a reader saw (new), and undo can bring it back', async () => {
    await status({status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-01', note: 'Freeze'});
    // Daily job not run yet: on Dec 2 the match reads as new.
    vi.useFakeTimers({toFake: ['Date'], now: LATER});
    expect((await getMatch(t.db, t.workspaceId, matchId)).status).toBe(MATCH_STATUS.new);
    vi.useRealTimers();
    await status({status: MATCH_STATUS.reviewing}, LATER, LATER_DAY);
    const [latest] = await listAuditEvents(t.db, t.workspaceId, {matchId});
    expect.soft(latest.fromValue, 'before value of the change').toBe(MATCH_STATUS.new);
    const undone = await undoLastAction(t.db, t.workspaceId, matchId, ACTOR, {}, LATER, LATER_DAY).then(
      () => 'undone',
      (error: Error) => error.message,
    );
    expect.soft(undone, 'undo of reviewing').toBe('undone');
  });

  it('F9 the audit history cannot be rewritten: delete + re-insert of an event is refused', async () => {
    await status({status: MATCH_STATUS.handled, note: 'Patched in PR 42'});
    const [event] = await t.db.select().from(auditEvents).where(eq(auditEvents.subjectId, matchId));
    const rewrite = t.db.transaction(async (tx) => {
      await tx.delete(auditEvents).where(eq(auditEvents.id, event.id));
      await tx.insert(auditEvents).values({...event, note: 'Never patched', actor: 'API key "Someone else"'});
    });
    await expect(rewrite).rejects.toThrow();
  });
});
