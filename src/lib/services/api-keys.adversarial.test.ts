/**
 * Adversarial tests for Settings scoped API keys (issue #35).
 * PROVED findings kept after the fix round.
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {API_KEY_SCOPE} from '@/lib/constants';
import {callApi, type RequestOptions} from '@/lib/api/test/client';
import {apiKeyScopes, apiKeys} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from '@/lib/services/api-keys';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

describe('adversarial: scoped API keys', () => {
  let fullKey: string;
  const api = (method: string, url: string, options?: RequestOptions) =>
    callApi(fullKey, method, url, options);

  beforeEach(async () => {
    t = await createTestDb();
    fullKey = (await createApiKey(t.db, t.workspaceId, 'UI')).key;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createApiKey with scopes is atomic: a failed scope insert must not leave an unrestricted key', async () => {
    const originalTransaction = t.db.transaction.bind(t.db);
    let scopeInserts = 0;
    vi.spyOn(t.db, 'transaction').mockImplementation(async (fn) =>
      originalTransaction(async (tx) => {
        const insert = tx.insert.bind(tx);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spy overloads
        (tx as any).insert = (table: unknown) => {
          if (table === apiKeyScopes) {
            scopeInserts += 1;
            throw new Error('simulated scope insert failure');
          }
          return insert(table as typeof apiKeys);
        };
        return fn(tx);
      }),
    );

    await expect(
      createApiKey(t.db, t.workspaceId, 'Half written', {scopes: [API_KEY_SCOPE.appsRead]}),
    ).rejects.toThrow(/simulated scope insert failure/);

    const rows = await t.db.select().from(apiKeys);
    const orphan = rows.find((r) => r.name === 'Half written');
    expect(orphan, 'orphaned key row after failed scope insert').toBeUndefined();
    expect(scopeInserts).toBeGreaterThan(0);
  });

  it('a scoped key still gets 403 on people and key management after the atomic create path', async () => {
    const scoped = (await api('POST', '/api/api-keys', {body: {name: 'Still scoped'}})).body.apiKey.key;
    expect((await api('GET', '/api/people', {key: scoped})).status).toBe(403);
    expect((await api('GET', '/api/api-keys', {key: scoped})).status).toBe(403);
  });
});
