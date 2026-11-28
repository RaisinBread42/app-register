/**
 * Adversarial test for [49] Governance Board, AC5 "overdue = … snoozes past their end", run on the
 * real notices service (PGlite), not hand-built objects: what the board receives for a snooze whose
 * date has come is what `listNotices` (behind GET /api/notices) returns.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ADVISORY_SEVERITY, ADVISORY_SOURCE, APP_KIND, MATCH_STATUS, PERSON_STATUS} from '@/lib/constants';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import type {App, Notice, Person} from '@/lib/ui/api-client';
import {accountability, deadlines, executiveSummary, outstandingRisk, portfolioHealth} from '@/lib/ui/governance';
import {createApp, listActiveApps} from './apps';
import {addDependency} from './dependencies';
import {replaceAdvisories} from './dependency-advisories';
import {changeMatchStatus, endExpiredSnoozes} from './notice-actions';
import {listNotices, syncAppNotices} from './notices';
import {createPerson, listActivePeople, updatePerson} from './people';

const TODAY = '2026-11-28';
const NOW = new Date('2026-11-28T09:00:00Z');
const LATER = '2026-12-10';
const ACTOR = {name: 'API key "Test"', keyId: null};

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

/** The API's JSON: dates become strings, as the board's page receives them. */
const asApi = async () => JSON.parse(JSON.stringify(await listNotices(t.db, t.workspaceId))) as Notice[];

describe('ADV [49] a snooze past its end, with notices from the real service: back in the queue', () => {
  beforeEach(async () => {
    t = await createTestDb();
    const ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Avery', email: 'avery@example.test'})).id;
    const app = await createApp(t.db, t.workspaceId, {name: 'Portal', kind: APP_KIND.inHouse, ownerId});
    const dependency = await addDependency(t.db, t.workspaceId, app.id, {name: 'left-pad', currentVersion: '1.0.0'});
    await replaceAdvisories(t.db, {id: dependency.id, workspaceId: t.workspaceId}, ADVISORY_SOURCE.osv, [
      {id: 'GHSA-aaaa-bbbb-cccc', aliases: [], severity: ADVISORY_SEVERITY.critical, summary: 'Remote code execution'},
    ]);
    await syncAppNotices(t.db, t.workspaceId, app.id, NOW, TODAY);
    const matchId = (await listNotices(t.db, t.workspaceId))[0].matches[0].id;
    await changeMatchStatus(t.db, t.workspaceId, matchId, {status: MATCH_STATUS.snoozed, snoozedUntil: '2026-12-05', note: 'Change freeze'}, ACTOR, NOW, TODAY);
  });
  afterEach(async () => {
    vi.useRealTimers();
    await t.client.close();
  });

  it('ADV-S1 a snooze that ended on 5 Dec is listed on 10 Dec, before the daily job runs', async () => {
    vi.useFakeTimers({toFake: ['Date'], now: new Date(`${LATER}T09:00:00Z`)});
    const notices = await asApi();
    expect(deadlines([], notices, LATER).reopened, 'board "Back in the queue"').toHaveLength(1);
  });

  it('ADV-S2 … and after the daily job has ended it', async () => {
    vi.useFakeTimers({toFake: ['Date'], now: new Date(`${LATER}T09:00:00Z`)});
    await endExpiredSnoozes(t.db, t.workspaceId, new Date(`${LATER}T06:00:00Z`), LATER);
    const notices = await asApi();
    expect(deadlines([], notices, LATER).reopened, 'board "Back in the queue"').toHaveLength(1);
  });
});

describe('ADV [49] "Owner has left" with people from the real service (GET /api/people)', () => {
  beforeEach(async () => {
    t = await createTestDb();
  });
  afterEach(async () => {
    await t.client.close();
  });

  it('ADV-S4 AC4: an app whose owner has left is listed, and the summary does not say every owner is active', async () => {
    const casey = await createPerson(t.db, t.workspaceId, {name: 'Casey Leaver', email: 'casey@example.test'});
    const sam = await createPerson(t.db, t.workspaceId, {name: 'Sam Backup', email: 'sam@example.test'});
    await createApp(t.db, t.workspaceId, {name: 'Payroll Bridge', kind: APP_KIND.saas, ownerId: casey.id, backupOwnerId: sam.id});
    await updatePerson(t.db, t.workspaceId, casey.id, {status: PERSON_STATUS.left, leftOn: TODAY});
    // What the page's apiClient().listApps() and listPeople() receive.
    const apps = JSON.parse(JSON.stringify(await listActiveApps(t.db, t.workspaceId))) as App[];
    const people = JSON.parse(JSON.stringify(await listActivePeople(t.db, t.workspaceId))) as Person[];
    const owners = accountability(apps, people.map((person) => person.id), [], TODAY);
    const summary = executiveSummary(portfolioHealth(apps), outstandingRisk([], TODAY), owners, deadlines(apps, [], TODAY), {staleSources: 0});
    expect(owners.ownerLeft.map((row) => row.label)).toEqual(['Payroll Bridge']);
    expect(summary.at(-1)).toBe('1 ownership gap: 0 without an active backup owner, 1 whose owner is no longer active.');
  });
});
