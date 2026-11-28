import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {APP_KIND} from '@/lib/constants';
import {API_HEADER, BEARER_PREFIX} from '@/lib/constants';
import {callApi, ROUTES, type RequestOptions} from '@/lib/api/test/client';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from '@/lib/services/api-keys';
import {fakeRegistry} from '@/lib/services/test/fake-registry';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

describe('notices API (adversarial review 76)', () => {
  let key: string;
  const api = (method: string, url: string, options?: RequestOptions) => callApi(key, method, url, options);

  beforeEach(async () => {
    t = await createTestDb();
    key = (await createApiKey(t.db, t.workspaceId, 'Test client')).key;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Status only, without the spec check (a 500 is not in every route's spec). */
  async function rawStatus(method: string, template: string, params: Record<string, string>, path: string, body?: unknown): Promise<number> {
    const handler = ROUTES[template][method] as (request: Request, context: {params: Promise<Record<string, string>>}) => Promise<Response>;
    const headers = new Headers({'content-type': 'application/json', [API_HEADER.authorization]: BEARER_PREFIX + key, [API_HEADER.idempotencyKey]: crypto.randomUUID()});
    const response = await handler(new Request(`http://localhost${path}`, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)}), {params: Promise.resolve(params)});
    return response.status;
  }

  async function newApp(name: string): Promise<string> {
    const owner = await api('POST', '/api/people', {body: {name: 'Owner', email: `${name.toLowerCase()}@example.test`}});
    const app = await api('POST', '/api/apps', {body: {name, kind: APP_KIND.inHouse, ownerId: owner.body.person.id}});
    return app.body.app.id;
  }

  it('A1 OSV answering a whitespace-only summary poisons the app: refresh, the daily job and hosting edits all fail', async () => {
    vi.stubGlobal(
      'fetch',
      fakeRegistry({
        latest: {'quill-forms': '3.9.0'},
        advisories: {'quill-forms@3.9.0': [{id: 'GHSA-qqqq-1111-aaaa', severity: 'CRITICAL', summary: '  '}]},
      }).fetch,
    );
    const appId = await newApp('Portal');
    await api('POST', `/api/apps/${appId}/dependencies`, {body: {name: 'quill-forms', currentVersion: '3.9.0'}});
    const hosting = await api('POST', `/api/apps/${appId}/hosting`, {body: {provider: 'Self-hosted box', service: 'VM'}});

    const hostingId = hosting.body.hosting.id;
    const refresh = await rawStatus('POST', '/api/apps/{id}/dependencies/refresh', {id: appId}, `/api/apps/${appId}/dependencies/refresh`);
    const daily = await rawStatus('POST', '/api/monitoring/refresh', {}, '/api/monitoring/refresh');
    const edit = await rawStatus('PATCH', '/api/apps/{id}/hosting/{hostingId}', {id: appId, hostingId}, `/api/apps/${appId}/hosting/${hostingId}`, {region: 'uksouth'});
    const after = await api('GET', `/api/apps/${appId}/hosting`);
    expect({refresh, daily, edit, regionKept: after.body.hosting[0].region}).toEqual({refresh: 200, daily: 200, edit: 200, regionKept: 'uksouth'});
  });

  it('A2 conformance: list (all states, resolved matches), get, malformed id and bad filters answer as the spec says', async () => {
    vi.stubGlobal(
      'fetch',
      fakeRegistry({
        latest: {'quill-forms': '3.9.0'},
        advisories: {'quill-forms@3.9.0': [{id: 'GHSA-qqqq-1111-aaaa', severity: 'CRITICAL', summary: 'Template injection'}]},
      }).fetch,
    );
    const appId = await newApp('Portal');
    const dependency = await api('POST', `/api/apps/${appId}/dependencies`, {body: {name: 'quill-forms', currentVersion: '3.9.0', vulnerabilities: ['CVE-2026-1234']}});
    await api('DELETE', `/api/apps/${appId}/dependencies/${dependency.body.dependency.id}`);
    const all = await api('GET', '/api/notices?state=all');
    expect(all.body.notices.length).toBeGreaterThan(0);
    await api('GET', `/api/notices/${all.body.notices[0].id}`);
    expect((await api('GET', '/api/notices/not-a-uuid')).status).toBe(404);
    expect((await api('GET', '/api/notices?state=bogus')).status).toBe(400);
    expect((await api('GET', '/api/notices?appId=not-a-uuid')).status).toBe(200);
  });
});
