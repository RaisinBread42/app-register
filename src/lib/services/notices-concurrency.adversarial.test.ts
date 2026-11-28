import {inArray} from 'drizzle-orm';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {ADVISORY_SEVERITY, ADVISORY_SOURCE, APP_KIND} from '@/lib/constants';
import {createDb, type AppDatabase} from '@/lib/db/client';
import {appNoticeMatches, notices} from '@/lib/db/schema';
import {createApp} from './apps';
import {addDependency} from './dependencies';
import {replaceAdvisories} from './dependency-advisories';
import {syncAppNotices} from './notices';
import {createPerson} from './people';
import {ensureDefaultWorkspace} from './workspaces';

/** Real Postgres only (PGlite is single-connection): TEST_POSTGRES_URL=postgres://.../adv76 */
const url = process.env.TEST_POSTGRES_URL;
const ROUNDS = 25;

describe.skipIf(!url)('notices under concurrent syncs on real Postgres (adversarial review 76)', () => {
  let db: AppDatabase;
  let workspaceId: string;
  let ownerId: string;

  beforeAll(async () => {
    db = createDb(url!);
    workspaceId = await ensureDefaultWorkspace(db);
    ownerId = (await createPerson(db, workspaceId, {name: 'Owner', email: `owner-${crypto.randomUUID()}@example.test`})).id;
  });
  afterAll(async () => {
    await (db as unknown as {$client: {end: () => Promise<void>}}).$client.end();
  });

  const newApp = () => createApp(db, workspaceId, {name: `App ${crypto.randomUUID()}`, kind: APP_KIND.inHouse, ownerId});
  const osv = (dependencyId: string, ids: string[]) =>
    replaceAdvisories(db, {id: dependencyId, workspaceId}, ADVISORY_SOURCE.osv, ids.map((id) => ({id, aliases: [], severity: ADVISORY_SEVERITY.high, summary: `Advisory ${id}`})));

  it('C1 two apps resolving the same advisory at once: the notice must end resolved upstream', async () => {
    const stuck: string[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      const advisory = `GHSA-c1${round.toString().padStart(2, '0')}-${crypto.randomUUID().slice(0, 4)}-zzzz`;
      const [a, b] = [await newApp(), await newApp()];
      const depA = await addDependency(db, workspaceId, a.id, {name: 'left-pad', currentVersion: '1.0.0'});
      const depB = await addDependency(db, workspaceId, b.id, {name: 'left-pad', currentVersion: '1.0.0'});
      await osv(depA.id, [advisory]);
      await osv(depB.id, [advisory]);
      await syncAppNotices(db, workspaceId, a.id);
      await syncAppNotices(db, workspaceId, b.id);
      // OSV withdraws it; both apps are re-checked at the same time.
      await osv(depA.id, []);
      await osv(depB.id, []);
      await Promise.all([syncAppNotices(db, workspaceId, a.id), syncAppNotices(db, workspaceId, b.id)]);
      // Any later sync does not heal it: only matches resolved in that sync are looked at.
      await syncAppNotices(db, workspaceId, a.id);
      await syncAppNotices(db, workspaceId, b.id);
      const [notice] = await db.select().from(notices).where(inArray(notices.externalId, [advisory]));
      const open = await db.select().from(appNoticeMatches).where(inArray(appNoticeMatches.noticeId, [notice.id]));
      if (notice.resolvedUpstreamAt === null && open.every((match) => match.resolvedAt !== null)) {
        stuck.push(advisory);
      }
    }
    expect(stuck, `${stuck.length}/${ROUNDS} notices left with every match resolved but resolved_upstream_at null`).toEqual([]);
  }, 120_000);

  it('C2 two apps sharing two advisories in opposite order, synced at once: no deadlock', async () => {
    const failures: string[] = [];
    const [x, y] = [`GHSA-c2xx-${crypto.randomUUID().slice(0, 4)}-xxxx`, `GHSA-c2yy-${crypto.randomUUID().slice(0, 4)}-yyyy`];
    const [a, b] = [await newApp(), await newApp()];
    // Dependencies load by name: A meets x first, B meets y first.
    await osv((await addDependency(db, workspaceId, a.id, {name: 'aaa', currentVersion: '1.0.0'})).id, [x]);
    await osv((await addDependency(db, workspaceId, a.id, {name: 'bbb', currentVersion: '1.0.0'})).id, [y]);
    await osv((await addDependency(db, workspaceId, b.id, {name: 'aaa', currentVersion: '1.0.0'})).id, [y]);
    await osv((await addDependency(db, workspaceId, b.id, {name: 'bbb', currentVersion: '1.0.0'})).id, [x]);
    for (let round = 0; round < ROUNDS; round++) {
      const results = await Promise.allSettled([syncAppNotices(db, workspaceId, a.id), syncAppNotices(db, workspaceId, b.id)]);
      for (const result of results) {
        if (result.status === 'rejected') {
          failures.push(`${(result.reason as {code?: string}).code}: ${(result.reason as Error).message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
