import {beforeEach, describe, expect, it} from 'vitest';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApp, getApp} from './apps';
import {addDependency, listDependencies, removeDependency, updateDependency} from './dependencies';
import {createPerson} from './people';

describe('app dependencies', () => {
  let t: TestDb;
  let appId: string;

  beforeEach(async () => {
    t = await createTestDb();
    const owner = await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'});
    const backup = await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'});
    appId = (await createApp(t.db, t.workspaceId, {name: 'Sentinel Access', kind: 'vendor_service', ownerId: owner.id, backupOwnerId: backup.id})).id;
  });

  it('an app’s dependencies can be added, listed, updated and removed; names are unique per app regardless of case', async () => {
    const agent = await addDependency(t.db, t.workspaceId, appId, {
      name: 'sentinel-agent',
      currentVersion: '4.2.1',
      latestVersion: '4.3.0',
      vulnerabilities: [' CVE-2026-31337 ', 'CVE-2026-31337', ''],
      recommendedAction: 'Upgrade to 4.3.0',
    });
    expect(agent.vulnerabilities).toEqual(['CVE-2026-31337']);
    await expect(
      addDependency(t.db, t.workspaceId, appId, {name: 'Sentinel-Agent', currentVersion: '1.0.0'}),
    ).rejects.toThrow(/already lists a dependency/);

    const upgraded = await updateDependency(t.db, t.workspaceId, appId, agent.id, {currentVersion: '4.3.0', vulnerabilities: []});
    expect(upgraded).toMatchObject({name: 'sentinel-agent', currentVersion: '4.3.0', vulnerabilities: [], latestVersion: '4.3.0'});
    expect((await getApp(t.db, t.workspaceId, appId)).dependencies).toEqual([upgraded]);

    await removeDependency(t.db, t.workspaceId, appId, agent.id);
    expect(await listDependencies(t.db, t.workspaceId, appId)).toEqual([]);
  });
});
