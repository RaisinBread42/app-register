import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ENV} from '@/lib/constants';
import {fetchFromRoutes} from '@/lib/api/test/client';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from '@/lib/services/api-keys';
import {createApiClient} from '@/lib/ui/api-client';
import {appListFilter} from '@/lib/ui/list-filters';
import type {DependencyFormValues} from '@/lib/ui/forms';
import * as actions from './actions';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));
vi.mock('next/cache', () => ({revalidatePath: vi.fn()}));

describe('adversarial: UI', () => {
  beforeEach(async () => {
    t = await createTestDb();
    const apiKey = (await createApiKey(t.db, t.workspaceId, 'UI')).key;
    vi.stubEnv(ENV.appUrl, 'http://register.test');
    vi.stubEnv(ENV.apiKey, apiKey);
    vi.stubGlobal('fetch', fetchFromRoutes);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('an out-of-range deadline window in the URL is dropped, not forwarded to the API (which 400s and breaks the page)', async () => {
    const filter = appListFilter({noticeDeadlineWithinDays: '99999999'});
    const api = createApiClient({baseUrl: 'http://register.test', apiKey: process.env[ENV.apiKey]!, fetch: fetchFromRoutes});
    await expect(api.listApps(filter)).resolves.toBeDefined();
  });

  it('a forged saveDependencyAction call gets an ActionResult, not an unhandled exception', async () => {
    const forged = null as unknown as DependencyFormValues;
    await expect(
      actions.saveDependencyAction(crypto.randomUUID(), crypto.randomUUID(), null, forged),
    ).resolves.toMatchObject({ok: false});
  });
});
