import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {APP_TAB, DEPENDENCY_CHECK_ERROR, ENV, HEALTH_STATUS} from '@/lib/constants';
import {fetchFromRoutes} from '@/lib/api/test/client';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from '@/lib/services/api-keys';
import {appTab} from '@/lib/ui/list-filters';
import type {Dependency} from '@/lib/ui/api-client';
import type {DependencyFormValues} from '@/lib/ui/forms';
import {statusNote} from '@/lib/ui/register-view';
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

  it('a forged or old tab in the URL opens the overview tab instead of an empty page', () => {
    expect(appTab(['licence', 'overview'])).toBe(APP_TAB.licence);
    expect(appTab('alerts')).toBe(APP_TAB.overview);
    expect(appTab('../../people')).toBe(APP_TAB.overview);
    expect(appTab(undefined)).toBe(APP_TAB.overview);
  });

  it('a forged saveDependencyAction call gets an ActionResult, not an unhandled exception', async () => {
    const forged = null as unknown as DependencyFormValues;
    await expect(
      actions.saveDependencyAction(crypto.randomUUID(), crypto.randomUUID(), null, forged),
    ).resolves.toMatchObject({ok: false});
  });

  it('a dependency that is not ok says why beside its status: not checked yet, check failed, not found, or a range', () => {
    const note = (status: Dependency['status'], checkError: Dependency['checkError']) => statusNote({status, checkError} as Dependency);
    expect(note(HEALTH_STATUS.na, null)).toBe('Not checked yet');
    expect(note(HEALTH_STATUS.na, DEPENDENCY_CHECK_ERROR.unavailable)).toBe('Check failed; will retry');
    expect(note(HEALTH_STATUS.na, DEPENDENCY_CHECK_ERROR.notFound)).toBe('Not found in registry');
    expect(note(HEALTH_STATUS.attention, DEPENDENCY_CHECK_ERROR.invalidVersion)).toBe('Version is a range; import package-lock.json for exact versions');
    expect(note(HEALTH_STATUS.ok, null)).toBeNull();
  });
});
