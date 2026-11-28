import {readFileSync} from 'node:fs';
import path from 'node:path';
import {eq} from 'drizzle-orm';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  API_KEY_SCOPE_LABEL,
  API_KEY_STATUS,
  APPLICATIONS_REGISTER_SCOPES,
  END_OF_SUPPORT_SOURCE,
  MONITORING_SOURCE_ID,
  MONITORING_SOURCE_STATUS,
} from '@/lib/constants';
import {callApi, type RequestOptions} from '@/lib/api/test/client';
import {apiKeys} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {
  authenticateApiKey,
  createApiKey,
  hashApiKey,
  listApiKeys,
  revokeApiKey,
} from '@/lib/services/api-keys';
import {listMonitoringSources} from '@/lib/services/monitoring-sources';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));

describe('Settings: monitoring sources and scoped API keys', () => {
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

  async function seedOwners() {
    const ada = (await api('POST', '/api/people', {body: {name: 'Ada Owner', email: 'ada@example.test'}})).body.person;
    const ben = (await api('POST', '/api/people', {body: {name: 'Ben Backup', email: 'ben@example.test'}})).body.person;
    return {ada, ben};
  }

  // Acceptance criteria (one test each).

  it('the cosmetic rows (brand colour, sidebar colour, heading font, body font, frontend stack) no longer appear in Settings', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/(register)/settings/SettingsView.tsx'),
      'utf8',
    );
    for (const label of [
      'Brand purple',
      'Sidebar',
      'Headings',
      'Body font',
      'Frontend',
      'Not configured',
      'Live register',
      '#612CCC',
      'Poppins',
    ]) {
      expect(source, label).not.toContain(label);
    }
  });

  it('Settings lists every monitoring data source the app uses today with what it monitors, status and last refresh', async () => {
    const sources = await listMonitoringSources(t.db, t.workspaceId);
    const ids = sources.map((s) => s.id);
    expect(ids).toContain(MONITORING_SOURCE_ID.npmRegistry);
    expect(ids).toContain(MONITORING_SOURCE_ID.osv);
    expect(ids).toContain(MONITORING_SOURCE_ID.endOfLifeDate);
    expect(sources.some((s) => s.name.includes('Azure') || s.monitors.includes('Azure'))).toBe(true);
    expect(sources.some((s) => s.monitors.toLowerCase().includes('vercel') || s.name.includes('Vercel'))).toBe(true);
    expect(sources.every((s) => s.monitors.length > 0)).toBe(true);
    expect(sources.every((s) => (MONITORING_SOURCE_STATUS as Record<string, string>)[s.status] || Object.values(MONITORING_SOURCE_STATUS).includes(s.status))).toBe(true);
    expect(sources.every((s) => s.lastRefreshedAt === null)).toBe(true);
    expect(sources.find((s) => s.id === MONITORING_SOURCE_ID.endOfLifeDate)?.name).toBe(
      END_OF_SUPPORT_SOURCE.endOfLifeDate,
    );
    // Nothing unimplemented: no licence or pricing sources.
    expect(sources.map((s) => s.name).join(' ')).not.toMatch(/licence|pricing/i);

    const viaApi = await api('GET', '/api/settings/monitoring-sources');
    expect(viaApi.status).toBe(200);
    expect(viaApi.body.sources).toEqual(sources);
  });

  it('a user can create an API key from Settings with a name and an expiry that is either a chosen date or no expiration', async () => {
    const none = await api('POST', '/api/api-keys', {body: {name: 'Agent no expiry', expiresOn: null}});
    expect(none.status).toBe(201);
    expect(none.body.apiKey).toMatchObject({
      name: 'Agent no expiry',
      expiresAt: null,
      scopeLabel: API_KEY_SCOPE_LABEL.applicationsRegister,
      status: API_KEY_STATUS.active,
    });
    expect(none.body.apiKey.scopes).toEqual(expect.arrayContaining([...APPLICATIONS_REGISTER_SCOPES]));

    const dated = await api('POST', '/api/api-keys', {
      body: {name: 'Agent dated', expiresOn: '2099-06-30'},
    });
    expect(dated.status).toBe(201);
    expect(dated.body.apiKey.expiresAt).toBe('2099-06-30T23:59:59.999Z');
  });

  it('the full key is shown exactly once at creation, with a way to copy it; only its hash is stored', async () => {
    const created = await api('POST', '/api/api-keys', {body: {name: 'Once'}});
    expect(created.status).toBe(201);
    expect(created.body.apiKey.key).toMatch(/^ar_/);
    expect(created.body.apiKey.key.length).toBeGreaterThan(20);

    const listed = await api('GET', '/api/api-keys');
    expect(JSON.stringify(listed.body)).not.toContain(created.body.apiKey.key);
    expect(listed.body.apiKeys.every((k: {key?: string}) => k.key === undefined)).toBe(true);

    const stored = await t.db.select().from(apiKeys).where(eq(apiKeys.id, created.body.apiKey.id));
    expect(stored).toHaveLength(1);
    expect(stored[0].keyHash).toBe(hashApiKey(created.body.apiKey.key));
    expect(JSON.stringify(stored)).not.toContain(created.body.apiKey.key);

    // Settings shows a Copy control next to the one-time key.
    const view = readFileSync(
      path.join(process.cwd(), 'src/app/(register)/settings/SettingsView.tsx'),
      'utf8',
    );
    expect(view).toMatch(/Copy key|copyKey/);

    // Replay of create never re-shows the secret.
    const firstKey = crypto.randomUUID();
    const first = await api('POST', '/api/api-keys', {idempotencyKey: firstKey, body: {name: 'Replay me'}});
    const second = await api('POST', '/api/api-keys', {idempotencyKey: firstKey, body: {name: 'Replay me'}});
    expect(second.status).toBe(201);
    expect(second.body.apiKey.id).toBe(first.body.apiKey.id);
    expect(second.body.apiKey.key).toBeNull();
  });

  it('Settings lists keys with name, prefix, scope, created date, expiry, last used and status', async () => {
    const created = await api('POST', '/api/api-keys', {
      body: {name: 'Listed key', expiresOn: '2099-01-15'},
    });
    await authenticateApiKey(t.db, created.body.apiKey.key);

    const listed = await listApiKeys(t.db, t.workspaceId);
    const row = listed.find((k) => k.id === created.body.apiKey.id)!;
    expect(row).toMatchObject({
      name: 'Listed key',
      keyPrefix: created.body.apiKey.keyPrefix,
      scopeLabel: API_KEY_SCOPE_LABEL.applicationsRegister,
      status: API_KEY_STATUS.active,
    });
    expect(row.scopes).toEqual(expect.arrayContaining([...APPLICATIONS_REGISTER_SCOPES]));
    expect(row.createdAt).toMatch(/^\d{4}-/);
    expect(row.expiresAt).toBe('2099-01-15T23:59:59.999Z');
    expect(row.lastUsedAt).toMatch(/^\d{4}-/);
  });

  it('a user can revoke a key, after a confirmation step', async () => {
    // Confirmation is a UI step; the API revoke is what the confirm action calls.
    const created = await api('POST', '/api/api-keys', {body: {name: 'To revoke'}});
    const revoked = await api('POST', `/api/api-keys/${created.body.apiKey.id}/revoke`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.apiKey.status).toBe(API_KEY_STATUS.revoked);
    expect(revoked.body.apiKey.revokedAt).toBeTruthy();

    const view = readFileSync(
      path.join(process.cwd(), 'src/app/(register)/settings/SettingsView.tsx'),
      'utf8',
    );
    expect(view).toContain('AlertDialog');
    expect(view).toMatch(/[Rr]evoke/);
  });

  it('keys created in Settings are scoped to the applications register and get 403 on any other endpoint', async () => {
    const {ada, ben} = await seedOwners();
    const scoped = (
      await api('POST', '/api/api-keys', {body: {name: 'Register agent'}})
    ).body.apiKey.key;
    const asScoped = (method: string, url: string, options?: RequestOptions) =>
      callApi(scoped, method, url, options);

    const app = (
      await asScoped('POST', '/api/apps', {
        body: {
          name: 'Agent CRM',
          kind: 'saas',
          ownerId: ada.id,
          backupOwnerId: ben.id,
          noticeDeadline: '2099-12-31',
        },
      })
    ).body.app;
    expect(app.name).toBe('Agent CRM');
    expect((await asScoped('GET', '/api/apps')).status).toBe(200);
    expect((await asScoped('PATCH', `/api/apps/${app.id}`, {body: {vendor: 'Contoso'}})).status).toBe(200);
    expect(
      (await asScoped('POST', `/api/apps/${app.id}/dependencies`, {body: {name: 'left-pad', currentVersion: '1.3.0'}}))
        .status,
    ).toBe(201);
    expect((await asScoped('GET', `/api/apps/${app.id}/dependencies`)).status).toBe(200);
    expect(
      (await asScoped('POST', `/api/apps/${app.id}/hosting`, {body: {provider: 'Vercel', service: 'Hosting'}})).status,
    ).toBe(201);
    expect((await asScoped('GET', `/api/apps/${app.id}/hosting`)).status).toBe(200);

    for (const [method, url, options] of [
      ['GET', '/api/people', {}],
      ['POST', '/api/people', {body: {name: 'Eve', email: 'eve@example.test'}}],
      ['GET', '/api/notice-alerts', {}],
      ['POST', '/api/monitoring/refresh', {}],
      ['GET', '/api/api-keys', {}],
      ['POST', '/api/api-keys', {body: {name: 'Nope'}}],
      ['POST', `/api/apps/${app.id}/archive`, {}],
      ['POST', `/api/apps/${app.id}/dependencies/refresh`, {}],
    ] as const) {
      const result = await asScoped(method, url, options);
      expect(result.status, `${method} ${url}`).toBe(403);
    }
  });

  it('expired and revoked keys get 401', async () => {
    const revoked = await createApiKey(t.db, t.workspaceId, 'Revoked soon', {
      scopes: APPLICATIONS_REGISTER_SCOPES,
    });
    await revokeApiKey(t.db, t.workspaceId, revoked.id);
    expect((await api('GET', '/api/apps', {key: revoked.key})).status).toBe(401);

    const dated = await createApiKey(t.db, t.workspaceId, 'Will expire', {
      expiresOn: '2099-01-01',
      scopes: APPLICATIONS_REGISTER_SCOPES,
    });
    await t.db
      .update(apiKeys)
      .set({expiresAt: new Date('2020-01-01T00:00:00.000Z')})
      .where(eq(apiKeys.id, dated.id));
    expect((await api('GET', '/api/apps', {key: dated.key})).status).toBe(401);
    expect((await listApiKeys(t.db, t.workspaceId)).find((k) => k.id === dated.id)?.status).toBe(
      API_KEY_STATUS.expired,
    );
  });

  it('existing keys created with api-key:create, including APP_REGISTER_API_KEY, keep full access; the migration is additive only', async () => {
    // fullKey was created without scopes (CLI / UI pattern).
    expect((await api('GET', '/api/people')).status).toBe(200);
    expect((await api('GET', '/api/api-keys')).status).toBe(200);
    expect((await api('POST', '/api/monitoring/refresh')).status).toBe(200);
    const listed = await listApiKeys(t.db, t.workspaceId);
    const ui = listed.find((k) => k.name === 'UI')!;
    expect(ui.scopeLabel).toBe(API_KEY_SCOPE_LABEL.fullAccess);
    expect(ui.scopes).toEqual([]);
    expect(ui.expiresAt).toBeNull();

    // Additive columns: existing rows have null expiry until used.
    const [row] = await t.db.select().from(apiKeys).where(eq(apiKeys.name, 'UI'));
    expect(row.expiresAt).toBeNull();
  });

  it('docs/api.md, the OpenAPI spec and docs/environments.md describe key scopes and expiry', async () => {
    const apiDoc = readFileSync(path.join(process.cwd(), 'docs/api.md'), 'utf8');
    const envDoc = readFileSync(path.join(process.cwd(), 'docs/environments.md'), 'utf8');
    const {openApiSpec} = await import('@/lib/api/openapi');
    const specText = JSON.stringify(openApiSpec);
    for (const [name, text] of [
      ['docs/api.md', apiDoc],
      ['docs/environments.md', envDoc],
      ['openapi', specText],
    ] as const) {
      expect(text.toLowerCase(), name).toMatch(/scope/);
      expect(text.toLowerCase(), name).toMatch(/expir/);
    }
    expect(specText).toContain('/api/api-keys');
    expect(apiDoc).toContain('Applications register');
  });

  // Edge cases.

  it('creating a key with an empty name or a past expiry date is refused', async () => {
    expect((await api('POST', '/api/api-keys', {body: {name: '  '}})).status).toBe(400);
    expect((await api('POST', '/api/api-keys', {body: {name: 'Past', expiresOn: '2020-01-01'}})).status).toBe(400);
  });

  it('revoking an already revoked key answers 404', async () => {
    const created = await api('POST', '/api/api-keys', {body: {name: 'Twice'}});
    expect((await api('POST', `/api/api-keys/${created.body.apiKey.id}/revoke`)).status).toBe(200);
    expect((await api('POST', `/api/api-keys/${created.body.apiKey.id}/revoke`)).status).toBe(404);
  });

  it('a scoped key can import dependencies and update hosting details', async () => {
    const {ada, ben} = await seedOwners();
    const scoped = (await api('POST', '/api/api-keys', {body: {name: 'Importer'}})).body.apiKey.key;
    const asScoped = (method: string, url: string, options?: RequestOptions) =>
      callApi(scoped, method, url, options);
    const created = await asScoped('POST', '/api/apps', {
      body: {
        name: 'Import App',
        kind: 'saas',
        ownerId: ada.id,
        backupOwnerId: ben.id,
        noticeDeadline: '2099-12-31',
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const app = created.body.app;
    const imported = await asScoped('POST', `/api/apps/${app.id}/dependencies/import`, {
      body: JSON.stringify({name: 'x', dependencies: {'left-pad': '1.3.0'}}),
    });
    expect(imported.status).toBe(200);
    const hosting = (
      await asScoped('POST', `/api/apps/${app.id}/hosting`, {body: {provider: 'Azure', service: 'App Service'}})
    ).body.hosting;
    expect(
      (await asScoped('PATCH', `/api/apps/${app.id}/hosting/${hosting.id}`, {body: {region: 'East US'}})).status,
    ).toBe(200);
  });

  // Security.

  it('a scoped key cannot list, create or revoke API keys', async () => {
    const scoped = (await api('POST', '/api/api-keys', {body: {name: 'No admin'}})).body.apiKey;
    expect((await api('GET', '/api/api-keys', {key: scoped.key})).status).toBe(403);
    expect((await api('POST', '/api/api-keys', {key: scoped.key, body: {name: 'Hijack'}})).status).toBe(403);
    expect((await api('POST', `/api/api-keys/${scoped.id}/revoke`, {key: scoped.key})).status).toBe(403);
  });

  it('API key material never appears in list responses or error logs', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const created = await api('POST', '/api/api-keys', {body: {name: 'Secret check'}});
    const listed = await api('GET', '/api/api-keys');
    expect(JSON.stringify(listed.body)).not.toContain(created.body.apiKey.key);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(created.body.apiKey.key);
  });
});
