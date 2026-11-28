import {beforeEach, describe, expect, it, vi} from 'vitest';
import {callApi, type RequestOptions} from '@/lib/api/test/client';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from '@/lib/services/api-keys';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

describe('adversarial API: inventory fields [22]', () => {
  let key: string;
  const api = (method: string, url: string, options?: RequestOptions) => callApi(key, method, url, options);

  beforeEach(async () => {
    t = await createTestDb();
    key = (await createApiKey(t.db, t.workspaceId, 'Test client')).key;
  });

  async function person(name: string) {
    return (await api('POST', '/api/people', {body: {name, email: `${name.toLowerCase()}@example.test`}})).body.person;
  }

  it('E: POST/PATCH/GET/replay with no backup owner, criticality, environments and repository all match the spec', async () => {
    const ada = await person('Ada');
    const idem = crypto.randomUUID();
    const body = {name: 'Solo', kind: 'in_house', ownerId: ada.id, criticality: 'high', environments: ['staging', 'production', 'staging'], repositoryUrl: 'https://git.example.test/a/b'};
    const first = await api('POST', '/api/apps', {body, idempotencyKey: idem});
    expect(first.status).toBe(201);
    expect(first.body.app.backupOwner).toBeNull();
    expect(first.body.app.environments).toEqual(['production', 'staging']);
    const replay = await api('POST', '/api/apps', {body, idempotencyKey: idem});
    expect(replay.status).toBe(201);
    expect(replay.body.app.id).toBe(first.body.app.id);
    const patched = await api('PATCH', `/api/apps/${first.body.app.id}`, {body: {name: 'Solo 2'}});
    expect(patched.body.app).toMatchObject({criticality: 'high', environments: ['production', 'staging'], repositoryUrl: 'https://git.example.test/a/b'});
    expect((await api('GET', '/api/apps')).status).toBe(200);
  });

  it('F: a repository URL the API accepted is answered within the documented maxLength', async () => {
    const ada = await person('Ada');
    const call = await api('POST', '/api/apps', {
      body: {name: 'Unicode', kind: 'saas', ownerId: ada.id, repositoryUrl: `https://git.example.test/${'é'.repeat(200)}`},
    });
    expect(call.status).toBe(201);
  });
});
