import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {APP_KIND, APPLICATIONS_REGISTER_SCOPES, HEALTH_STATUS} from '@/lib/constants';
import {callApi, type RequestOptions} from '@/lib/api/test/client';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from '@/lib/services/api-keys';
import {fakeRegistry} from '@/lib/services/test/fake-registry';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

/** ADV31 API: the new health and source fields conform to the spec, and scoped keys stay out of Settings. */
describe('ADV31 source freshness API', () => {
  let key: string;
  const api = (method: string, url: string, options?: RequestOptions) => callApi(key, method, url, options);

  beforeEach(async () => {
    t = await createTestDb();
    key = (await createApiKey(t.db, t.workspaceId, 'Test client')).key;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ADV31-A1 a stale app and the sources list answer as the spec says; a Settings-scoped key cannot read the sources', async () => {
    const owner = await api('POST', '/api/people', {body: {name: 'Owner', email: 'owner@example.test'}});
    const app = await api('POST', '/api/apps', {body: {name: 'Portal', kind: APP_KIND.inHouse, ownerId: owner.body.person.id}});
    const appId = app.body.app.id;
    vi.stubGlobal('fetch', fakeRegistry({latest: {express: '4.21.2'}}).fetch);
    await api('POST', `/api/apps/${appId}/dependencies`, {body: {name: 'express', currentVersion: '4.21.2'}});
    vi.stubGlobal('fetch', fakeRegistry({latest: {express: '4.21.2'}, isOsvDown: true}).fetch);
    await api('POST', `/api/apps/${appId}/dependencies/refresh`);

    const detail = await api('GET', `/api/apps/${appId}`);
    const list = await api('GET', '/api/apps');
    const sources = await api('GET', '/api/settings/monitoring-sources');
    expect(sources.status).toBe(200);
    expect(detail.body.app.health.status).toBe(HEALTH_STATUS.stale);
    expect(list.body.apps[0].health).toEqual(detail.body.app.health);

    const scoped = (await createApiKey(t.db, t.workspaceId, 'Scoped', {scopes: APPLICATIONS_REGISTER_SCOPES})).key;
    const denied = await api('GET', '/api/settings/monitoring-sources', {key: scoped});
    expect(denied.status).toBe(403);
  });
});
