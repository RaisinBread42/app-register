import {beforeEach, describe, expect, it} from 'vitest';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApp, getApp} from './apps';
import {addHosting, listHosting, removeHosting, updateHosting} from './hosting';
import {createPerson} from './people';

describe('app hosting', () => {
  let t: TestDb;
  let appId: string;

  beforeEach(async () => {
    t = await createTestDb();
    const owner = await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'});
    const backup = await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'});
    appId = (await createApp(t.db, t.workspaceId, {name: 'Sentinel Access', kind: 'vendor_service', ownerId: owner.id, backupOwnerId: backup.id})).id;
  });

  it('an app’s hosting can be added, listed, updated and removed, with one row per provider service and region', async () => {
    const sql = await addHosting(t.db, t.workspaceId, appId, {provider: 'Azure', service: 'SQL Server', region: 'uksouth', version: '2016 SP3', endOfSupportOn: '2027-02-04'});
    // Same service in another region is a separate row; the same region again is refused, even with no region.
    await addHosting(t.db, t.workspaceId, appId, {provider: 'Azure', service: 'SQL Server', region: 'ukwest'});
    await expect(
      addHosting(t.db, t.workspaceId, appId, {provider: 'Azure', service: 'SQL Server', region: 'uksouth'}),
    ).rejects.toThrow(/already lists that provider service/);
    await addHosting(t.db, t.workspaceId, appId, {provider: 'Cloudflare', service: 'DNS'});
    await expect(
      addHosting(t.db, t.workspaceId, appId, {provider: 'Cloudflare', service: 'DNS', region: null}),
    ).rejects.toThrow(/already lists that provider service/);

    const migrated = await updateHosting(t.db, t.workspaceId, appId, sql.id, {version: '2022', endOfSupportOn: '2033-01-11'});
    expect(migrated).toMatchObject({provider: 'Azure', service: 'SQL Server', region: 'uksouth', version: '2022', endOfSupportOn: '2033-01-11'});
    expect((await getApp(t.db, t.workspaceId, appId)).hosting).toHaveLength(3);

    await removeHosting(t.db, t.workspaceId, appId, sql.id);
    expect((await listHosting(t.db, t.workspaceId, appId)).map((h) => [h.provider, h.region])).toEqual([
      ['Azure', 'ukwest'],
      ['Cloudflare', null],
    ]);
  });
});
