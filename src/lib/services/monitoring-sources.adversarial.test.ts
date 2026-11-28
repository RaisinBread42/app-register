/**
 * Adversarial tests for Settings monitoring sources (issue #35 / AC2).
 * Failures here are intentional proof; do not "fix" them to green.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  DEPENDENCY_CHECK_ERROR,
  END_OF_SUPPORT_SOURCE,
  MONITORING_SOURCE_ID,
  MONITORING_SOURCE_STATUS,
} from '@/lib/constants';
import {newId} from '@/lib/db/ids';
import {appDependencies, appHosting, apps, people} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {listMonitoringSources} from '@/lib/services/monitoring-sources';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

async function seedApp(): Promise<string> {
  const ownerId = newId();
  const backupId = newId();
  const appId = newId();
  await t.db.insert(people).values([
    {id: ownerId, workspaceId: t.workspaceId, name: 'Ada Owner', email: 'ada.adv@example.test'},
    {id: backupId, workspaceId: t.workspaceId, name: 'Ben Backup', email: 'ben.adv@example.test'},
  ]);
  await t.db.insert(apps).values({
    id: appId,
    workspaceId: t.workspaceId,
    name: 'Adversarial App',
    kind: 'saas',
    ownerId,
    backupOwnerId: backupId,
  });
  return appId;
}

describe('adversarial: monitoring source status (AC2)', () => {
  beforeEach(async () => {
    t = await createTestDb();
  });

  it('marks npm and OSV unavailable when dependency checks have only failed', async () => {
    const appId = await seedApp();
    await t.db.insert(appDependencies).values({
      id: newId(),
      workspaceId: t.workspaceId,
      appId,
      name: 'left-pad',
      currentVersion: '1.3.0',
      checkedAt: null,
      checkError: DEPENDENCY_CHECK_ERROR.unavailable,
    });

    const sources = await listMonitoringSources(t.db, t.workspaceId);
    const npm = sources.find((s) => s.id === MONITORING_SOURCE_ID.npmRegistry);
    const osv = sources.find((s) => s.id === MONITORING_SOURCE_ID.osv);

    // AC2 status vocabulary + constants comment: unavailable = checks have only failed.
    expect(npm?.status).toBe(MONITORING_SOURCE_STATUS.unavailable);
    expect(osv?.status).toBe(MONITORING_SOURCE_STATUS.unavailable);
  });

  it('does not call hosting sources reachable when the last check only stored health errors', async () => {
    const appId = await seedApp();
    await t.db.insert(appHosting).values({
      id: newId(),
      workspaceId: t.workspaceId,
      appId,
      provider: 'Vercel',
      service: 'Hosting',
      healthCheckedAt: new Date('2026-11-20T12:00:00.000Z'),
      healthError: 'Vercel status: timed out; endoflife.date: timed out',
    });

    const sources = await listMonitoringSources(t.db, t.workspaceId);
    const eol = sources.find((s) => s.id === MONITORING_SOURCE_ID.endOfLifeDate);
    const vercel = sources.find((s) => s.name.toLowerCase().includes('vercel'));

    // Constants: reachable = at least one successful check stored.
    // healthError means the outside sources failed — must not report reachable.
    expect(eol?.status).toBe(MONITORING_SOURCE_STATUS.unavailable);
    expect(vercel?.status).toBe(MONITORING_SOURCE_STATUS.unavailable);
    expect(eol?.status).not.toBe(MONITORING_SOURCE_STATUS.reachable);
    expect(vercel?.status).not.toBe(MONITORING_SOURCE_STATUS.reachable);
  });

  /**
   * AC2: each source shows *its* status. Dependency monitoring stores
   * latestVersion from npm even when OSV fails (checkError=unavailable,
   * checkedAt still null on a first failure). npm and OSV must not share one
   * status blob when the stored facts diverge.
   */
  it('reports npm reachable and OSV unavailable when the registry answered but advisories did not', async () => {
    const appId = await seedApp();
    await t.db.insert(appDependencies).values({
      id: newId(),
      workspaceId: t.workspaceId,
      appId,
      name: 'left-pad',
      currentVersion: '1.3.0',
      latestVersion: '1.3.0',
      checkedAt: null,
      checkError: DEPENDENCY_CHECK_ERROR.unavailable,
    });

    const sources = await listMonitoringSources(t.db, t.workspaceId);
    const npm = sources.find((s) => s.id === MONITORING_SOURCE_ID.npmRegistry);
    const osv = sources.find((s) => s.id === MONITORING_SOURCE_ID.osv);

    expect(npm?.status).toBe(MONITORING_SOURCE_STATUS.reachable);
    expect(osv?.status).toBe(MONITORING_SOURCE_STATUS.unavailable);
  });

  /**
   * AC2: endoflife.date and a provider status feed are separate sources.
   * A row can hold an EOL date from endoflife.date while healthError names only
   * the status feed — EOL must stay reachable; the feed alone is unavailable.
   */
  it('reports endoflife.date reachable when EOL was stored even if the status feed failed', async () => {
    const appId = await seedApp();
    await t.db.insert(appHosting).values({
      id: newId(),
      workspaceId: t.workspaceId,
      appId,
      provider: 'Vercel',
      service: 'Hosting',
      endOfSupportOn: '2027-06-01',
      endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate,
      healthCheckedAt: new Date('2026-11-20T12:00:00.000Z'),
      healthError: 'Vercel status: timed out',
    });

    const sources = await listMonitoringSources(t.db, t.workspaceId);
    const eol = sources.find((s) => s.id === MONITORING_SOURCE_ID.endOfLifeDate);
    const vercel = sources.find((s) => s.name.toLowerCase().includes('vercel'));

    expect(eol?.status).toBe(MONITORING_SOURCE_STATUS.reachable);
    expect(vercel?.status).toBe(MONITORING_SOURCE_STATUS.unavailable);
  });
});
