import {readdirSync} from 'node:fs';
import path from 'node:path';
import {eq, sql} from 'drizzle-orm';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  API_HEADER,
  DEPENDENCY_CHECK_ERROR,
  DEPENDENCY_IMPORT_MAX_BYTES,
  HEALTH_STATUS,
  NOTICE_ALERT_STATUS,
  PERSON_STATUS,
  RESOURCE_KIND,
} from '@/lib/constants';
import {callApi, ROUTES, type RequestOptions} from '@/lib/api/test/client';
import {openApiSpec} from '@/lib/api/openapi';
import {newId} from '@/lib/db/ids';
import {apiKeys, apps, idempotencyKeys, people, workspaces} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey, revokeApiKey} from '@/lib/services/api-keys';
import {fakeRegistry} from '@/lib/services/test/fake-registry';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

describe('JSON API', () => {
  let key: string;
  const api = (method: string, url: string, options?: RequestOptions) =>
    callApi(key, method, url, options);

  beforeEach(async () => {
    t = await createTestDb();
    key = (await createApiKey(t.db, t.workspaceId, 'Test client')).key;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** A fictional app's package.json, and what the outside sources know about its packages. */
  const PACKAGE_JSON = JSON.stringify({
    name: 'contoso-portal',
    dependencies: {'quill-forms': '3.9.0', 'tally-ui': '^2.4.9'},
    devDependencies: {'lint-kit': '9.2.0'},
  });
  function stubRegistry() {
    const registry = fakeRegistry({
      latest: {'quill-forms': '5.0.2', 'tally-ui': '2.4.9', 'lint-kit': '9.2.0', 'harbor-http': '1.6.0'},
      advisories: {
        'quill-forms@3.9.0': [{id: 'GHSA-qqqq-1111-aaaa', severity: 'CRITICAL', summary: 'Template injection in quill-forms'}],
      },
    });
    vi.stubGlobal('fetch', registry.fetch);
    return registry;
  }

  async function seedApp(name = 'Contoso CRM') {
    const ada = (await api('POST', '/api/people', {body: {name: 'Ada Owner', email: `ada.${name.length}@example.test`}})).body.person;
    const ben = (await api('POST', '/api/people', {body: {name: 'Ben Backup', email: `ben.${name.length}@example.test`}})).body.person;
    const app = (await api('POST', '/api/apps', {body: {name, kind: 'saas', ownerId: ada.id, backupOwnerId: ben.id, noticeDeadline: '2099-12-31'}})).body.app;
    return {ada, ben, app};
  }

  async function otherWorkspace() {
    const workspaceId = newId();
    await t.db.insert(workspaces).values({id: workspaceId, name: 'Fabrikam', slug: 'fabrikam'});
    const otherKey = (await createApiKey(t.db, workspaceId, 'Fabrikam client')).key;
    return {workspaceId, call: (method: string, url: string, options?: RequestOptions) => callApi(otherKey, method, url, options)};
  }

  // Authentication.

  it('a request without a valid bearer API key is refused with 401; the OpenAPI document is public', async () => {
    const revoked = await createApiKey(t.db, t.workspaceId, 'Old laptop');
    await revokeApiKey(t.db, t.workspaceId, revoked.keyPrefix);

    for (const bad of [null, 'ar_not-a-real-key', 'not-even-prefixed', revoked.key]) {
      const read = await api('GET', '/api/apps', {key: bad});
      expect(read.status, String(bad)).toBe(401);
      expect(read.headers.get('www-authenticate')).toBe('Bearer');
      expect((await api('POST', '/api/people', {key: bad, body: {name: 'Eve', email: 'eve@example.test'}})).status).toBe(401);
    }
    expect(await t.db.select().from(people)).toHaveLength(0);
    expect((await api('GET', '/api/apps')).status).toBe(200);

    const spec = await api('GET', '/api/openapi.json', {key: null});
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
  });

  it('a key only reaches its own workspace, and only a hash of the key is stored', async () => {
    const mine = await seedApp();
    const other = await otherWorkspace();
    const theirs = (await other.call('POST', '/api/people', {body: {name: 'Cy Other', email: 'cy@example.test'}})).body.person;

    expect((await other.call('GET', '/api/apps')).body.apps).toEqual([]);
    expect((await other.call('GET', `/api/apps/${mine.app.id}`)).status).toBe(404);
    expect((await other.call('PATCH', `/api/apps/${mine.app.id}`, {body: {vendor: 'X'}})).status).toBe(404);
    expect((await other.call('GET', `/api/apps/${mine.app.id}/dependencies`)).status).toBe(404);
    expect((await other.call('POST', `/api/apps/${mine.app.id}/hosting`, {body: {provider: 'AWS', service: 'S3'}})).status).toBe(404);
    expect((await other.call('POST', `/api/notice-alerts/${mine.app.alerts[0].id}/acknowledge`)).status).toBe(404);
    expect((await api('PATCH', `/api/people/${theirs.id}`, {body: {name: 'Hijacked'}})).status).toBe(404);
    expect((await api('GET', '/api/people')).body.people.map((p: {name: string}) => p.name)).toEqual(['Ada Owner', 'Ben Backup']);

    const stored = await t.db.select().from(apiKeys);
    expect(JSON.stringify(stored)).not.toContain(key);
    expect(stored.every((row) => /^[0-9a-f]{64}$/.test(row.keyHash))).toBe(true);
  });

  // Idempotency.

  it('POST and PATCH without an Idempotency-Key get 400 and change nothing', async () => {
    const {app} = await seedApp();

    const post = await api('POST', '/api/people', {idempotencyKey: null, body: {name: 'Dee', email: 'dee@example.test'}});
    expect(post.status).toBe(400);
    expect(post.body.error).toMatch(/Idempotency-Key/);
    const patch = await api('PATCH', `/api/apps/${app.id}`, {idempotencyKey: null, body: {vendor: 'Contoso'}});
    expect(patch.status).toBe(400);
    expect((await api('POST', '/api/people', {idempotencyKey: 'k'.repeat(256), body: {name: 'Dee', email: 'dee@example.test'}})).status).toBe(400);

    expect((await api('GET', '/api/people')).body.people).toHaveLength(2);
    expect((await api('GET', `/api/apps/${app.id}`)).body.app.vendor).toBeNull();
  });

  it('repeating a POST or PATCH with the same Idempotency-Key answers as the first did and writes nothing new, even when both arrive at once', async () => {
    const {ada, ben} = await seedApp();
    const save = {name: 'Northwind Mail', kind: 'saas', ownerId: ada.id, backupOwnerId: ben.id, noticeDeadline: '2099-06-30'};

    // A double-click: two identical saves in flight together.
    const [first, second] = await Promise.all([
      api('POST', '/api/apps', {idempotencyKey: 'save-northwind', body: save}),
      api('POST', '/api/apps', {idempotencyKey: 'save-northwind', body: save}),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body).toEqual(first.body);
    // And a retry later.
    expect((await api('POST', '/api/apps', {idempotencyKey: 'save-northwind', body: save})).body).toEqual(first.body);

    const created = await t.db.select().from(apps).where(eq(apps.name, 'Northwind Mail'));
    expect(created).toHaveLength(1);
    expect(first.body.app.alerts).toHaveLength(3);
    expect((await api('GET', `/api/notice-alerts?appId=${created[0].id}`)).body.alerts).toHaveLength(3);

    const update = {idempotencyKey: 'rename-1', body: {vendor: 'Northwind Traders'}};
    const updated = await api('PATCH', `/api/apps/${created[0].id}`, update);
    const replayed = await api('PATCH', `/api/apps/${created[0].id}`, update);
    expect(replayed.body).toEqual(updated.body);
    expect((await api('GET', `/api/apps/${created[0].id}`)).body.app.updatedAt).toBe(updated.body.app.updatedAt);
  });

  it('reusing an Idempotency-Key for a different request gets 422 and changes nothing', async () => {
    const first = await api('POST', '/api/people', {idempotencyKey: 'add-person', body: {name: 'Fay', email: 'fay@example.test'}});
    expect(first.status).toBe(201);

    const reused = await api('POST', '/api/people', {idempotencyKey: 'add-person', body: {name: 'Gus', email: 'gus@example.test'}});
    expect(reused.status).toBe(422);
    const elsewhere = await api('PATCH', `/api/people/${first.body.person.id}`, {idempotencyKey: 'add-person', body: {name: 'Fay F.'}});
    expect(elsewhere.status).toBe(422);
    expect((await api('GET', '/api/people')).body.people.map((p: {name: string}) => p.name)).toEqual(['Fay']);
  });

  it('a replay returns the stored status and the resource\'s current state, rebuilt from relational data', async () => {
    const add = {idempotencyKey: 'add-fay', body: {name: 'Fay', email: 'fay@example.test'}};
    const first = await api('POST', '/api/people', add);
    expect(first.status).toBe(201);
    const [stored] = await t.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, 'add-fay'));
    expect(stored).toMatchObject({statusCode: 201, resourceKind: RESOURCE_KIND.person, resourceId: first.body.person.id, countAdded: null});
    // No copy of the response is kept: the row holds the key, a hash, a status, a kind, an id and counts.
    expect(JSON.stringify(stored)).not.toContain('fay@example.test');

    const renamed = await api('PATCH', `/api/people/${first.body.person.id}`, {body: {name: 'Fay Farrow'}});
    const replay = await api('POST', '/api/people', add);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual({person: renamed.body.person});
    expect((await api('GET', '/api/people')).body.people).toHaveLength(1);
  });

  it('a replay of each kind of write answers in the same shape as the first response, and 404 once the resource is deleted', async () => {
    const {app} = await seedApp();
    const writes: [string, string, unknown][] = [
      ['PATCH', `/api/apps/${app.id}`, {vendor: 'Contoso'}],
      ['POST', `/api/apps/${app.id}/hosting`, {provider: 'Azure', service: 'SQL Server', region: 'uksouth'}],
      ['POST', `/api/notice-alerts/${app.alerts[0].id}/acknowledge`, undefined],
      ['POST', `/api/apps/${app.id}/archive`, undefined],
    ];
    const firsts = [];
    for (const [method, url, body] of writes) {
      const first = await api(method, url, {idempotencyKey: url, body});
      const replay = await api(method, url, {idempotencyKey: url, body});
      expect(replay.status, url).toBe(first.status);
      expect(Object.keys(replay.body), url).toEqual(Object.keys(first.body));
      firsts.push(first);
    }
    const hosting = firsts[1].body.hosting;
    expect((await api('POST', writes[1][1], {idempotencyKey: writes[1][1], body: writes[1][2]})).body).toEqual({hosting});

    await t.db.execute(sql`delete from app_hosting where id = ${hosting.id}`);
    expect((await api('POST', writes[1][1], {idempotencyKey: writes[1][1], body: writes[1][2]})).status).toBe(404);
  });

  it('a replay of a new dependency shows what the check found since, not the unchecked first answer', async () => {
    const {app} = await seedApp();
    stubRegistry();
    const add = {idempotencyKey: 'add-quill', body: {name: 'quill-forms', currentVersion: '3.9.0'}};
    const first = await api('POST', `/api/apps/${app.id}/dependencies`, add);
    expect(first.body.dependency).toMatchObject({checkedAt: null, advisories: []});

    const replay = await api('POST', `/api/apps/${app.id}/dependencies`, add);
    expect(replay.status).toBe(201);
    expect(replay.body.dependency).toMatchObject({id: first.body.dependency.id, latestVersion: '5.0.2', advisories: [{id: 'GHSA-qqqq-1111-aaaa'}]});
  });

  it('a replay of an import answers with the counts of the first run, stored as four numbers, whatever was imported since', async () => {
    const {app} = await seedApp();
    stubRegistry();
    const path = `/api/apps/${app.id}/dependencies/import`;
    const first = await api('POST', path, {idempotencyKey: 'build-1', body: PACKAGE_JSON});
    const [stored] = await t.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, 'build-1'));
    expect(stored).toMatchObject({
      statusCode: 200,
      resourceKind: RESOURCE_KIND.dependencyImport,
      resourceId: app.id,
      countAdded: 3,
      countUpdated: 0,
      countUnchanged: 0,
      countRemoved: 0,
    });

    const later = await api('POST', path, {idempotencyKey: 'build-2', body: JSON.stringify({name: 'contoso-portal', dependencies: {'quill-forms': '5.0.2'}})});
    expect(later.body).toEqual({import: {added: 0, updated: 1, unchanged: 0, removed: 2}});
    const replay = await api('POST', path, {idempotencyKey: 'build-1', body: PACKAGE_JSON});
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect((await api('GET', `/api/apps/${app.id}/dependencies`)).body.dependencies).toHaveLength(1);
  });

  it('an Idempotency-Key is forgotten after 24 hours', async () => {
    const {app} = await seedApp();
    const edit = {idempotencyKey: 'nightly-sync', body: {vendor: 'Contoso Ltd'}};
    const first = await api('PATCH', `/api/apps/${app.id}`, edit);

    await t.db
      .update(idempotencyKeys)
      .set({createdAt: sql`now() - interval '24 hours 1 minute'`})
      .where(eq(idempotencyKeys.key, 'nightly-sync'));
    const later = await api('PATCH', `/api/apps/${app.id}`, edit);

    expect(later.status).toBe(200);
    expect(later.body.app.updatedAt).not.toBe(first.body.app.updatedAt);
  });

  // New endpoints.

  it('apps can be archived and people marked as left through the API', async () => {
    const {ada, app} = await seedApp();

    const archived = await api('POST', `/api/apps/${app.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.app.archivedAt).not.toBeNull();
    expect(archived.body.app.alerts).toEqual([]);
    expect((await api('GET', '/api/apps')).body.apps).toEqual([]);
    expect((await api('PATCH', `/api/apps/${app.id}`, {body: {vendor: 'X'}})).status).toBe(404);

    const left = await api('PATCH', `/api/people/${ada.id}`, {body: {status: PERSON_STATUS.left, leftOn: '2026-11-20'}});
    expect(left.body.person).toMatchObject({status: PERSON_STATUS.left, leftOn: '2026-11-20'});
    expect((await api('GET', '/api/people')).body.people.map((p: {id: string}) => p.id)).not.toContain(ada.id);
    expect((await api('PATCH', `/api/people/${ada.id}`, {body: {status: PERSON_STATUS.left, leftOn: null}})).status).toBe(400);
    const back = await api('PATCH', `/api/people/${ada.id}`, {body: {status: PERSON_STATUS.active}});
    expect(back.body.person).toMatchObject({status: PERSON_STATUS.active, leftOn: null});
  });

  it('every route is documented in the OpenAPI spec, and nothing in the spec is missing a route', () => {
    const apiDir = path.join(process.cwd(), 'src/app/api');
    const routeFiles = (readdirSync(apiDir, {recursive: true}) as string[])
      .filter((file) => file.endsWith('route.ts'))
      .map((file) => '/api/' + path.dirname(file).replace(/\[(\w+)\]/g, '{$1}').split(path.sep).join('/'));

    const documented = Object.keys(openApiSpec.paths);
    expect(routeFiles.sort()).toEqual([...documented].sort());
    expect(Object.keys(ROUTES).sort()).toEqual([...documented].sort());

    for (const [template, operations] of Object.entries(openApiSpec.paths)) {
      const handlers = Object.keys(ROUTES[template]).filter((name) => /^[A-Z]+$/.test(name));
      expect(handlers.map((m) => m.toLowerCase()).sort(), template).toEqual(Object.keys(operations).sort());
    }
  });

  it('every endpoint returns its documented shape, 400 on invalid input and 404 for an unknown or other-workspace id', async () => {
    // Every call below is also checked against the OpenAPI schema for its status.
    const {ada, ben, app} = await seedApp();
    expect((await api('POST', '/api/people', {body: {name: 'No Email'}})).status).toBe(400);
    expect((await api('POST', '/api/people', {body: 'not json'})).status).toBe(400);
    expect((await api('GET', '/api/people')).status).toBe(200);
    expect((await api('PATCH', `/api/people/${ben.id}`, {body: {email: 'not-an-email'}})).status).toBe(400);
    expect((await api('PATCH', `/api/people/${ben.id}`, {body: {name: 'Ben\u0000'}})).status).toBe(400);

    const input = {name: 'Other', kind: 'saas', ownerId: ada.id, backupOwnerId: ben.id};
    expect((await api('POST', '/api/apps', {body: {...input, costCents: -5}})).status).toBe(400);
    expect((await api('POST', '/api/apps', {body: {...input, ownerId: newId()}})).status).toBe(400);
    expect((await api('GET', '/api/apps?kind=saas&sort=notice_deadline&noticeDeadlineWithinDays=36500')).body.apps).toHaveLength(1);
    for (const query of ['kind=spreadsheet', 'sort=price', 'noticeDeadlineWithinDays=-1', 'noticeDeadlineWithinDays=100000000']) {
      expect((await api('GET', `/api/apps?${query}`)).status, query).toBe(400);
    }
    expect((await api('GET', `/api/apps/${app.id}`)).body.app).toEqual(app);
    expect((await api('PATCH', `/api/apps/${app.id}`, {body: {noticeDeadline: '31/12/2099'}})).status).toBe(400);

    const dependency = await api('POST', `/api/apps/${app.id}/dependencies`, {body: {name: 'contoso-sdk', currentVersion: '4.2.1', latestVersion: '5.0.0', vulnerabilities: ['CVE-2026-1234']}});
    expect(dependency.status).toBe(201);
    expect((await api('POST', `/api/apps/${app.id}/dependencies`, {body: {name: 'CONTOSO-SDK', currentVersion: '1'}})).status).toBe(400);
    expect((await api('POST', `/api/apps/${app.id}/dependencies`, {body: {name: 'x', currentVersion: '1', vulnerabilities: 'CVE-1'}})).status).toBe(400);
    expect((await api('PATCH', `/api/apps/${app.id}/dependencies/${dependency.body.dependency.id}`, {body: {currentVersion: '5.0.0'}})).body.dependency.currentVersion).toBe('5.0.0');
    expect((await api('GET', `/api/apps/${app.id}/dependencies`)).body.dependencies).toHaveLength(1);

    const hosting = await api('POST', `/api/apps/${app.id}/hosting`, {body: {provider: 'Azure', service: 'SQL Server', region: 'uksouth', version: '2016 SP3', endOfSupportOn: '2027-02-04'}});
    expect(hosting.status).toBe(201);
    expect((await api('POST', `/api/apps/${app.id}/hosting`, {body: {provider: 'Azure', service: 'SQL Server', region: 'uksouth'}})).status).toBe(400);
    expect((await api('POST', `/api/apps/${app.id}/hosting`, {body: {provider: 'Azure'}})).status).toBe(400);
    expect((await api('POST', `/api/apps/${app.id}/hosting`, {body: {provider: 'Azure', service: 'S\u00003'}})).status).toBe(400);
    expect((await api('PATCH', `/api/apps/${app.id}/hosting/${hosting.body.hosting.id}`, {body: {endOfSupportOn: 'soon'}})).status).toBe(400);
    expect((await api('GET', `/api/apps/${app.id}/hosting`)).body.hosting).toHaveLength(1);
    expect((await api('GET', `/api/apps/${app.id}`)).body.app).toMatchObject({dependencies: [{name: 'contoso-sdk'}], hosting: [{provider: 'Azure'}]});

    const alerts = await api('GET', `/api/notice-alerts?status=${NOTICE_ALERT_STATUS.scheduled}&appId=${app.id}`);
    expect(alerts.body.alerts).toHaveLength(3);
    expect((await api('GET', '/api/notice-alerts?status=snoozed')).status).toBe(400);
    expect((await api('GET', '/api/notice-alerts?appId=42')).status).toBe(400);
    const ack = await api('POST', `/api/notice-alerts/${alerts.body.alerts[0].id}/acknowledge`);
    expect(ack.body.alert.status).toBe(NOTICE_ALERT_STATUS.acknowledged);

    expect((await api('DELETE', `/api/apps/${app.id}/dependencies/${dependency.body.dependency.id}`)).status).toBe(204);
    expect((await api('DELETE', `/api/apps/${app.id}/hosting/${hosting.body.hosting.id}`)).status).toBe(204);

    // 404: unknown ids, malformed ids and ids from another workspace.
    const other = await otherWorkspace();
    const cy = (await other.call('POST', '/api/people', {body: {name: 'Cy', email: 'cy@example.test'}})).body.person;
    const di = (await other.call('POST', '/api/people', {body: {name: 'Di', email: 'di@example.test'}})).body.person;
    const otherApp = (await other.call('POST', '/api/apps', {body: {name: 'Fabrikam Vault', kind: 'saas', ownerId: cy.id, backupOwnerId: di.id, noticeDeadline: '2099-12-31'}})).body.app;
    const otherDependency = (await other.call('POST', `/api/apps/${otherApp.id}/dependencies`, {body: {name: 'vault-agent', currentVersion: '1.0'}})).body.dependency;

    for (const id of [newId(), 'not-a-uuid', otherApp.id]) {
      expect((await api('GET', `/api/apps/${id}`)).status).toBe(404);
      expect((await api('PATCH', `/api/apps/${id}`, {body: {vendor: 'X'}})).status).toBe(404);
      expect((await api('POST', `/api/apps/${id}/archive`)).status).toBe(404);
      expect((await api('GET', `/api/apps/${id}/hosting`)).status).toBe(404);
      expect((await api('POST', `/api/apps/${id}/dependencies`, {body: {name: 'x', currentVersion: '1'}})).status).toBe(404);
    }
    for (const id of [newId(), 'nope', otherDependency.id]) {
      expect((await api('PATCH', `/api/apps/${app.id}/dependencies/${id}`, {body: {currentVersion: '2'}})).status).toBe(404);
      expect((await api('DELETE', `/api/apps/${app.id}/hosting/${id}`)).status).toBe(404);
    }
    for (const id of [newId(), otherApp.alerts[0].id]) {
      expect((await api('POST', `/api/notice-alerts/${id}/acknowledge`)).status).toBe(404);
    }
    expect((await api('PATCH', `/api/people/${newId()}`, {body: {name: 'Nobody'}})).status).toBe(404);
    expect((await api('POST', '/api/apps', {body: {...input, name: 'Cross', ownerId: cy.id}})).status).toBe(400);
  });

  // Dependency import and monitoring.

  it('posting a package file imports it once per Idempotency-Key and then checks the dependencies, so a pipeline can send its lockfile on every build', async () => {
    const {app} = await seedApp();
    const registry = stubRegistry();
    const path = `/api/apps/${app.id}/dependencies/import`;

    const first = await api('POST', path, {idempotencyKey: 'build-481', body: PACKAGE_JSON});
    expect(first.status).toBe(200);
    expect(first.body).toEqual({import: {added: 3, updated: 0, unchanged: 0, removed: 0}});
    const retry = await api('POST', path, {idempotencyKey: 'build-481', body: PACKAGE_JSON});
    expect(retry.body).toEqual(first.body);
    expect((await api('POST', path, {idempotencyKey: 'build-481', body: '{"name":"other"}'})).status).toBe(422);

    const {dependencies, health} = (await api('GET', `/api/apps/${app.id}`)).body.app;
    expect(dependencies.map((d: {name: string}) => d.name).sort()).toEqual(['lint-kit', 'quill-forms', 'tally-ui']);
    expect(dependencies.find((d: {name: string}) => d.name === 'quill-forms')).toMatchObject({
      latestVersion: '5.0.2',
      status: HEALTH_STATUS.critical,
      advisories: [{id: 'GHSA-qqqq-1111-aaaa', severity: 'critical'}],
    });
    // 100 − 10 (critical advisory) − 3 (a major version behind).
    expect(health).toMatchObject({score: 87, status: HEALTH_STATUS.attention});
    expect(registry.requests.length).toBeGreaterThan(0);
  });

  it('a dependency added or edited by hand is checked against the registry straight away', async () => {
    const {app} = await seedApp();
    stubRegistry();

    const added = (await api('POST', `/api/apps/${app.id}/dependencies`, {body: {name: 'harbor-http', currentVersion: '1.2.7'}})).body.dependency;
    const afterAdd = (await api('GET', `/api/apps/${app.id}/dependencies`)).body.dependencies[0];
    expect(afterAdd).toMatchObject({latestVersion: '1.6.0', checkError: null, status: HEALTH_STATUS.attention});
    expect(afterAdd.checkedAt).not.toBeNull();

    await api('PATCH', `/api/apps/${app.id}/dependencies/${added.id}`, {body: {name: 'contoso-internal-sdk'}});
    const afterEdit = (await api('GET', `/api/apps/${app.id}/dependencies`)).body.dependencies[0];
    expect(afterEdit).toMatchObject({name: 'contoso-internal-sdk', checkError: DEPENDENCY_CHECK_ERROR.notFound, advisories: []});
  });

  it('the app list and the app detail carry a health score with one entry per dimension; dimensions not monitored yet are null', async () => {
    const {app} = await seedApp();
    stubRegistry();
    const unmonitored = {hosting: null, licence: null, pricing: null};

    const empty = (await api('GET', '/api/apps')).body.apps[0].health;
    expect(empty).toEqual({score: null, status: HEALTH_STATUS.na, dimensions: {dependencies: {status: HEALTH_STATUS.na, deductions: []}, ...unmonitored}});

    await api('POST', `/api/apps/${app.id}/dependencies/import`, {body: PACKAGE_JSON});
    const listed = (await api('GET', '/api/apps')).body.apps[0].health;
    expect(listed).toEqual({
      score: 87,
      status: HEALTH_STATUS.attention,
      dimensions: {
        dependencies: {
          status: HEALTH_STATUS.attention,
          deductions: [
            {dimension: 'dependencies', label: 'Critical advisory in quill-forms 3.9.0', detail: 'GHSA-qqqq-1111-aaaa · Template injection in quill-forms', points: 10},
            {dimension: 'dependencies', label: 'quill-forms is a major version behind', detail: '3.9.0 → 5.0.2', points: 3},
          ],
        },
        ...unmonitored,
      },
    });
    expect((await api('GET', `/api/apps/${app.id}`)).body.app.health).toEqual(listed);
  });

  it('the refresh endpoints re-check on demand without an Idempotency-Key: one app, or every active app in the workspace', async () => {
    const {app} = await seedApp();
    await api('POST', `/api/apps/${app.id}/dependencies`, {body: {name: 'quill-forms', currentVersion: '3.9.0'}});
    expect((await api('GET', `/api/apps/${app.id}/dependencies`)).body.dependencies[0].checkError).toBe(DEPENDENCY_CHECK_ERROR.unavailable);

    stubRegistry();
    const one = await api('POST', `/api/apps/${app.id}/dependencies/refresh`, {idempotencyKey: null});
    expect(one.body).toEqual({refresh: {checked: 1, notFound: 0, unavailable: 0, advisories: 1}});
    const all = await api('POST', '/api/monitoring/dependencies/refresh', {idempotencyKey: null});
    expect(all.body).toEqual({refresh: {apps: 1, checked: 1, notFound: 0, unavailable: 0, advisories: 1}});
    expect((await api('GET', `/api/apps/${app.id}/dependencies`)).body.dependencies[0]).toMatchObject({latestVersion: '5.0.2', checkError: null});
  });

  it('an import that is not JSON, not a package file, or over the size cap gets 400 and imports nothing', async () => {
    const {app} = await seedApp();
    const path = `/api/apps/${app.id}/dependencies/import`;

    for (const body of ['{"name": "contoso-portal", ', '[]', '{"compilerOptions": {}}']) {
      const refused = await api('POST', path, {body});
      expect(refused.status, body).toBe(400);
    }
    const oversized = await api('POST', path, {
      body: PACKAGE_JSON,
      headers: {[API_HEADER.contentLength]: String(DEPENDENCY_IMPORT_MAX_BYTES + 1)},
    });
    expect(oversized.status).toBe(400);
    expect((await api('GET', `/api/apps/${app.id}/dependencies`)).body.dependencies).toEqual([]);
  });

  it('a key cannot import into or refresh another workspace’s app, and a workspace refresh never touches another workspace', async () => {
    const {app} = await seedApp();
    await api('POST', `/api/apps/${app.id}/dependencies`, {body: {name: 'quill-forms', currentVersion: '3.9.0'}});
    const other = await otherWorkspace();
    const registry = stubRegistry();

    expect((await other.call('POST', `/api/apps/${app.id}/dependencies/import`, {body: PACKAGE_JSON})).status).toBe(404);
    expect((await other.call('POST', `/api/apps/${app.id}/dependencies/refresh`)).status).toBe(404);
    expect((await other.call('POST', '/api/monitoring/dependencies/refresh')).body.refresh).toMatchObject({apps: 0, checked: 0});
    expect((await api('POST', '/api/monitoring/dependencies/refresh', {key: null})).status).toBe(401);

    expect(registry.requests).toEqual([]);
    const mine = (await api('GET', `/api/apps/${app.id}/dependencies`)).body.dependencies;
    expect(mine).toMatchObject([{name: 'quill-forms', latestVersion: null}]);
  });

  // Edge cases.

  it('a request that fails validation does not use up its Idempotency-Key', async () => {
    const typo = await api('POST', '/api/people', {idempotencyKey: 'new-hire', body: {name: 'Hal', email: 'hal@example'}});
    expect(typo.status).toBe(400);
    expect(await t.db.select().from(idempotencyKeys)).toHaveLength(0);

    // The client fixes the body but keeps its key: that is a different request, so it runs.
    const fixed = await api('POST', '/api/people', {idempotencyKey: 'new-hire', body: {name: 'Hal', email: 'hal@example.test'}});
    expect(fixed.status).toBe(201);
  });

  it('the same Idempotency-Key in two workspaces does not collide', async () => {
    const other = await otherWorkspace();
    const body = {name: 'Ivy', email: 'ivy@example.test'};

    const mine = await api('POST', '/api/people', {idempotencyKey: 'onboard-ivy', body});
    const theirs = await other.call('POST', '/api/people', {idempotencyKey: 'onboard-ivy', body});

    expect([mine.status, theirs.status]).toEqual([201, 201]);
    expect(theirs.body.person.id).not.toBe(mine.body.person.id);
  });

  it('deleting a dependency twice answers 404 the second time', async () => {
    const {app} = await seedApp();
    const dependency = (await api('POST', `/api/apps/${app.id}/dependencies`, {body: {name: 'left-pad', currentVersion: '1.3.0'}})).body.dependency;

    expect((await api('DELETE', `/api/apps/${app.id}/dependencies/${dependency.id}`)).status).toBe(204);
    expect((await api('DELETE', `/api/apps/${app.id}/dependencies/${dependency.id}`)).status).toBe(404);
  });

  // Security.

  it('a failed write never puts an email address in the response or the server log', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const email = 'grace.hopper@example.test';
    await api('POST', '/api/people', {body: {name: 'Grace H', email}});

    const duplicate = await api('POST', '/api/people', {body: {name: 'Grace H', email: email.toUpperCase()}});
    expect(duplicate.status).toBe(400);
    expect(JSON.stringify(duplicate.body)).not.toContain('grace');

    // An unexpected database error whose detail quotes the row ("Failing row contains ... email")
    // is answered with a generic 500 and logged by name and code only.
    await t.client.exec(`alter table people add constraint test_reject_grace check (email not like 'grace%') not valid`);
    const broken = await api('POST', '/api/people', {body: {name: 'Grace H', email: 'grace.h@example.test'}});
    expect(broken.status).toBe(500);
    expect(JSON.stringify(broken.body)).not.toContain('grace');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('grace');
    expect(logged).toHaveBeenCalled();
  });
});
