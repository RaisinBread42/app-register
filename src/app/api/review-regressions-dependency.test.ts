import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as importRoute from '@/app/api/apps/[id]/dependencies/import/route';
import {API_HEADER, BEARER_PREFIX, DEPENDENCY_IMPORT_MAX_BYTES, HEALTH_STATUS, HTTP_METHOD, OSV_API_URL} from '@/lib/constants';
import {callApi, type RequestOptions} from '@/lib/api/test/client';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from '@/lib/services/api-keys';
import {fakeRegistry} from '@/lib/services/test/fake-registry';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

/** Rules an adversarial review of the dependency API found broken; each test failed before its fix unless it says otherwise. */
describe('review regressions: dependency API', () => {
  let apiKey: string;
  const api = (method: string, url: string, options: RequestOptions = {}) => callApi(apiKey, method, url, options);

  const PACKAGE_JSON = JSON.stringify({name: 'contoso-portal', dependencies: {'quill-forms': '3.9.0'}});

  beforeEach(async () => {
    t = await createTestDb();
    apiKey = (await createApiKey(t.db, t.workspaceId, 'adv')).key;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function seedApp() {
    const ada = (await api('POST', '/api/people', {body: {name: 'Ada Owner', email: 'ada@example.test'}})).body.person;
    const ben = (await api('POST', '/api/people', {body: {name: 'Ben Backup', email: 'ben@example.test'}})).body.person;
    return (await api('POST', '/api/apps', {body: {name: 'Contoso CRM', kind: 'saas', ownerId: ada.id, backupOwnerId: ben.id}})).body.app;
  }

  it('an import without an API key answers 401 whatever its Content-Length', async () => {
    const app = await seedApp();
    const refused = await api('POST', `/api/apps/${app.id}/dependencies/import`, {
      key: null,
      body: PACKAGE_JSON,
      headers: {[API_HEADER.contentLength]: String(DEPENDENCY_IMPORT_MAX_BYTES + 1)},
    });
    expect(refused.status).toBe(401);
  });

  it('an import body sent in chunks with no Content-Length is refused with 400 once it passes the size cap, and imports nothing', async () => {
    const app = await seedApp();
    const chunk = new TextEncoder().encode(' '.repeat(1024 * 1024));
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent++;
        controller.enqueue(chunk);
      },
    });
    const request = new Request(`http://localhost/api/apps/${app.id}/dependencies/import`, {
      method: HTTP_METHOD.post,
      headers: {[API_HEADER.authorization]: BEARER_PREFIX + apiKey, [API_HEADER.idempotencyKey]: 'chunked-1'},
      body: endless,
      duplex: 'half',
    } as RequestInit);

    const response = await importRoute.POST(request, {params: Promise.resolve({id: app.id})});
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({error: 'The request body is larger than 5 MB'});
    // Reading stopped at the cap: the stream never ends, so reading it all would never return.
    expect(sent).toBeLessThan(10);
    expect((await api('GET', `/api/apps/${app.id}/dependencies`)).body.dependencies).toEqual([]);
  });

  it('replaying an import with the same Idempotency-Key does not call the registry and OSV again', async () => {
    const app = await seedApp();
    const registry = fakeRegistry({latest: {'quill-forms': '5.0.2'}});
    vi.stubGlobal('fetch', registry.fetch);
    const path = `/api/apps/${app.id}/dependencies/import`;
    await api('POST', path, {idempotencyKey: 'build-1', body: PACKAGE_JSON});
    const afterFirst = registry.requests.length;
    expect(afterFirst).toBeGreaterThan(0);
    await api('POST', path, {idempotencyKey: 'build-1', body: PACKAGE_JSON});
    expect(registry.requests.length).toBe(afterFirst);
  });

  it('a package file with two names that are the same after trimming gets 400 naming the package, not 500', async () => {
    const app = await seedApp();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const body = JSON.stringify({name: 'x', dependencies: {'quill-forms': '1.0.0', ' quill-forms': '2.0.0'}});
    const answer = await api('POST', `/api/apps/${app.id}/dependencies/import`, {body});
    expect(answer.status).toBe(400);
    expect(answer.body.error).toContain('"quill-forms" is listed more than once');
  });

  it('a JSON object that is not a package file gets 400 and leaves the imported dependencies alone', async () => {
    const app = await seedApp();
    vi.stubGlobal('fetch', fakeRegistry({latest: {'quill-forms': '5.0.2'}}).fetch);
    const path = `/api/apps/${app.id}/dependencies/import`;
    await api('POST', path, {body: PACKAGE_JSON});
    expect((await api('POST', path, {body: {name: 'contoso-portal', version: '1.0.0'}})).status).toBe(400);
    expect((await api('GET', `/api/apps/${app.id}/dependencies`)).body.dependencies).toHaveLength(1);
  });

  it('a dependency name or version that is too long gets 400 when added or edited by hand', async () => {
    const app = await seedApp();
    vi.stubGlobal('fetch', fakeRegistry({latest: {}}).fetch);
    const path = `/api/apps/${app.id}/dependencies`;
    expect((await api('POST', path, {body: {name: 'n'.repeat(215), currentVersion: '1.0.0'}})).status).toBe(400);
    expect((await api('POST', path, {body: {name: 'quill-forms', currentVersion: '1'.repeat(257)}})).status).toBe(400);
    const {dependency} = (await api('POST', path, {body: {name: 'quill-forms', currentVersion: '1.0.0'}})).body;
    expect((await api('PATCH', `${path}/${dependency.id}`, {body: {name: 'n'.repeat(20_000)}})).status).toBe(400);
  });

  it('one malformed OSV answer after an import does not turn GET /api/apps into a 500', async () => {
    const app = await seedApp();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = fakeRegistry({latest: {'quill-forms': '5.0.2'}}).fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === `${OSV_API_URL}/querybatch`) {
        return Response.json({results: [{vulns: [{id: 'GHSA-evil-0000-0000'}]}]});
      }
      if (url.startsWith(`${OSV_API_URL}/vulns/`)) {
        return Response.json({id: 'GHSA-evil-0000-0000', aliases: 'CVE-2026-0001', summary: 'x'.repeat(10)});
      }
      return base(url, init);
    });
    const imported = await api('POST', `/api/apps/${app.id}/dependencies/import`, {body: PACKAGE_JSON});
    expect(imported.status).toBe(200);
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.startsWith(`${OSV_API_URL}/vulns/`)) {
        return Response.json({id: 'GHSA-evil-0000-0000', aliases: {length: 1}, summary: 'x'});
      }
      if (url === `${OSV_API_URL}/querybatch`) {
        return Response.json({results: [{vulns: [{id: 'GHSA-evil-0000-0000'}]}]});
      }
      return base(url, init);
    });
    expect((await api('POST', `/api/apps/${app.id}/dependencies/refresh`, {idempotencyKey: null})).status).toBe(200);
    expect((await api('GET', '/api/apps')).status).toBe(200);
    const detail = await api('GET', `/api/apps/${app.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.app.dependencies[0].advisories).toMatchObject([{id: 'GHSA-evil-0000-0000', aliases: []}]);
  });

  it('when the follow-up check fails, the write still stands, is not repeated, and the dependency shows as unchecked, not ok', async () => {
    const app = await seedApp();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed ada@example.test');
    });
    const first = await api('POST', `/api/apps/${app.id}/dependencies/import`, {idempotencyKey: 'k1', body: PACKAGE_JSON});
    expect(first.status).toBe(200);
    const again = await api('POST', `/api/apps/${app.id}/dependencies/import`, {idempotencyKey: 'k1', body: PACKAGE_JSON});
    expect(again.body).toEqual(first.body);
    const {dependencies} = (await api('GET', `/api/apps/${app.id}/dependencies`)).body;
    expect(dependencies).toHaveLength(1);
    expect(dependencies[0]).toMatchObject({status: HEALTH_STATUS.na, checkedAt: null, checkError: 'unavailable'});
    expect((await api('GET', `/api/apps/${app.id}`)).body.app.health).toMatchObject({score: null, status: HEALTH_STATUS.na});
  });

  it('import and refresh answer 400 without an Idempotency-Key where one is needed and 404 for an unknown or archived app (passed before the fixes; kept as a guard)', async () => {
    const app = await seedApp();
    vi.stubGlobal('fetch', fakeRegistry({latest: {'quill-forms': '5.0.2'}}).fetch);
    expect((await api('POST', `/api/apps/${app.id}/dependencies/import`, {body: PACKAGE_JSON})).status).toBe(200);
    expect((await api('POST', `/api/apps/${app.id}/dependencies/import`, {body: PACKAGE_JSON, idempotencyKey: null})).status).toBe(400);
    expect((await api('POST', `/api/apps/not-a-uuid/dependencies/import`, {body: PACKAGE_JSON})).status).toBe(404);
    expect((await api('POST', `/api/apps/not-a-uuid/dependencies/refresh`, {idempotencyKey: null})).status).toBe(404);
    await api('POST', `/api/apps/${app.id}/archive`, {body: {}});
    expect((await api('POST', `/api/apps/${app.id}/dependencies/refresh`, {idempotencyKey: null})).status).toBe(404);
    expect((await api('POST', `/api/apps/${app.id}/dependencies/import`, {body: PACKAGE_JSON})).status).toBe(404);
  });
});
