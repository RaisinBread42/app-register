import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {APP_LIST_SORT, ENV, FILTER_ALL, PERSON_STATUS} from '@/lib/constants';
import {fetchFromRoutes} from '@/lib/api/test/client';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from '@/lib/services/api-keys';
import {ACTION_MESSAGE} from '@/lib/ui/action-result';
import {createApiClient, type ApiClient} from '@/lib/ui/api-client';
import {appToForm, emptyAppForm, type AppFormValues} from '@/lib/ui/forms';
import {applyAppListView, appsWithRenewal, upcomingNoticeDeadlines} from '@/lib/ui/register-view';
import * as actions from './actions';

let t: TestDb;

vi.mock('@/lib/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/client')>()),
  getDb: () => t.db,
}));
vi.mock('next/cache', () => ({revalidatePath: vi.fn()}));

/**
 * The UI's server actions and API client, run against the real route handlers
 * on a PGlite database: what a Save click does, minus the browser.
 */
describe('App Register UI', () => {
  let api: ApiClient;
  const key = () => crypto.randomUUID();

  beforeEach(async () => {
    t = await createTestDb();
    const apiKey = (await createApiKey(t.db, t.workspaceId, 'UI')).key;
    vi.stubEnv(ENV.appUrl, 'http://register.test');
    vi.stubEnv(ENV.apiKey, apiKey);
    vi.stubGlobal('fetch', fetchFromRoutes);
    api = createApiClient({baseUrl: 'http://register.test', apiKey, fetch: fetchFromRoutes});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function seedPeople() {
    const priya = await api.createPerson(key(), {name: 'Priya Chen', email: 'priya.chen@meridian.example'});
    const marcus = await api.createPerson(key(), {name: 'Marcus Okonkwo', email: 'marcus.o@meridian.example'});
    return {priya, marcus};
  }

  function atlasBoard(ownerId: string, backupOwnerId: string): AppFormValues {
    return {
      ...emptyAppForm('saas'),
      name: 'Atlas Board',
      ownerId,
      backupOwnerId,
      vendor: 'Atlas Software',
      noticeDeadline: '2099-03-31',
      renewalDate: '2099-06-30',
      cost: 4800,
    };
  }

  async function seedApp() {
    const {priya, marcus} = await seedPeople();
    const result = await actions.createAppAction(key(), atlasBoard(priya.id, marcus.id));
    return {priya, marcus, appId: result.appId!};
  }

  // Acceptance criteria.

  it('AC1: the applications list shows each app with name, kind, owner and renewal, filtered by type and search and sorted as chosen', async () => {
    const {priya, marcus} = await seedPeople();
    await actions.createAppAction(key(), atlasBoard(priya.id, marcus.id));
    await actions.createAppAction(key(), {
      ...emptyAppForm('in_house'),
      name: 'Badge Printer',
      ownerId: marcus.id,
      backupOwnerId: priya.id,
      renewalDate: '2098-01-15',
      runtimeLocation: 'Reception PC, Building 2',
      dataAndKeys: 'Visitor names; printer admin password',
      whatBreaksIfStopped: 'Visitors get handwritten badges',
    });
    const apps = await api.listApps();

    const bySoonestRenewal = applyAppListView(apps, {query: '', kind: FILTER_ALL, sort: APP_LIST_SORT.renewal});
    expect(bySoonestRenewal.map((app) => [app.name, app.kind, app.owner.name, app.renewalDate])).toEqual([
      ['Badge Printer', 'in_house', 'Marcus Okonkwo', '2098-01-15'],
      ['Atlas Board', 'saas', 'Priya Chen', '2099-06-30'],
    ]);
    const saasOnly = applyAppListView(apps, {query: '', kind: 'saas', sort: APP_LIST_SORT.name});
    expect(saasOnly.map((app) => app.name)).toEqual(['Atlas Board']);
    const searched = applyAppListView(apps, {query: '  printer ', kind: FILTER_ALL, sort: APP_LIST_SORT.name});
    expect(searched.map((app) => app.name)).toEqual(['Badge Printer']);
  });

  it('the overview lists renewals and upcoming notice deadlines from real app dates, soonest first, leaving out deadlines already passed', async () => {
    const {priya, marcus} = await seedPeople();
    await actions.createAppAction(key(), atlasBoard(priya.id, marcus.id));
    await actions.createAppAction(key(), {...atlasBoard(marcus.id, priya.id), name: 'Slate Chat', noticeDeadline: '2098-11-30', renewalDate: '2098-12-31'});
    await actions.createAppAction(key(), {...atlasBoard(marcus.id, priya.id), name: 'No Dates', noticeDeadline: '', renewalDate: ''});
    const apps = await api.listApps();

    expect(appsWithRenewal(apps).map((app) => app.name)).toEqual(['Slate Chat', 'Atlas Board']);
    expect(upcomingNoticeDeadlines(apps, '2098-11-30').map((app) => [app.name, app.noticeDeadline])).toEqual([
      ['Slate Chat', '2098-11-30'],
      ['Atlas Board', '2099-03-31'],
    ]);
    expect(upcomingNoticeDeadlines(apps, '2098-12-01').map((app) => app.name)).toEqual(['Atlas Board']);
  });

  it('AC2: saving the add-app form twice with the same idempotency key creates one app', async () => {
    const {priya, marcus} = await seedPeople();
    const saveKey = key();
    const values = atlasBoard(priya.id, marcus.id);

    const [first, second] = await Promise.all([
      actions.createAppAction(saveKey, values),
      actions.createAppAction(saveKey, values),
    ]);

    expect(first).toMatchObject({ok: true});
    expect(second).toEqual(first);
    const apps = await api.listApps();
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({name: 'Atlas Board', vendor: 'Atlas Software', costCents: 480000});
  });

  it('AC3: editing an app changes its owners and dates, and the list shows the new owner', async () => {
    const {priya, marcus, appId} = await seedApp();
    const jamal = await api.createPerson(key(), {name: 'Jamal Reyes', email: 'jamal.r@meridian.example'});
    const values = appToForm(await api.getApp(appId));

    const result = await actions.updateAppAction(key(), appId, {
      ...values,
      ownerId: jamal.id,
      backupOwnerId: priya.id,
      noticeDeadline: '2099-09-30',
      renewalDate: '2099-12-31',
    });

    expect(result).toEqual({ok: true});
    const app = await api.getApp(appId);
    expect(app).toMatchObject({
      owner: {name: 'Jamal Reyes'},
      backupOwner: {name: 'Priya Chen'},
      noticeDeadline: '2099-09-30',
      renewalDate: '2099-12-31',
    });
    expect((await api.listApps())[0].owner.name).toBe('Jamal Reyes');
    expect(marcus.status).toBe(PERSON_STATUS.active);
  });

  it('AC5: dependencies and hosting can be added, edited and removed on an app', async () => {
    const {appId} = await seedApp();

    await actions.saveDependencyAction(key(), appId, null, {
      name: 'next',
      currentVersion: '15.2.0',
      latestVersion: '16.4.6',
      vulnerabilities: 'CVE-2026-1234, ',
      recommendedAction: '',
    });
    const [dependency] = (await api.getApp(appId)).dependencies;
    expect(dependency).toMatchObject({name: 'next', vulnerabilities: ['CVE-2026-1234'], recommendedAction: null});
    await actions.saveDependencyAction(key(), appId, dependency.id, {
      name: 'next',
      currentVersion: '16.4.6',
      latestVersion: '16.4.6',
      vulnerabilities: '',
      recommendedAction: '',
    });
    expect((await api.getApp(appId)).dependencies[0]).toMatchObject({currentVersion: '16.4.6', vulnerabilities: []});

    await actions.saveHostingAction(key(), appId, null, {
      provider: 'Azure',
      service: 'App Service',
      region: 'westeurope',
      version: '',
      endOfSupportOn: '2099-11-30',
    });
    const [hosting] = (await api.getApp(appId)).hosting;
    await actions.saveHostingAction(key(), appId, hosting.id, {
      provider: 'Azure',
      service: 'App Service',
      region: 'northeurope',
      version: '',
      endOfSupportOn: '',
    });
    expect((await api.getApp(appId)).hosting[0]).toMatchObject({region: 'northeurope', endOfSupportOn: null});

    expect(await actions.removeDependencyAction(appId, dependency.id)).toEqual({ok: true});
    expect(await actions.removeHostingAction(appId, hosting.id)).toEqual({ok: true});
    const after = await api.getApp(appId);
    expect([after.dependencies, after.hosting]).toEqual([[], []]);
  });

  it('AC7: archiving an app removes it from the apps list but keeps its page', async () => {
    const {appId} = await seedApp();

    expect(await actions.archiveAppAction(key(), appId)).toEqual({ok: true});

    expect(await api.listApps()).toEqual([]);
    expect((await api.getApp(appId)).archivedAt).not.toBeNull();
  });

  it('AC8: people can be added, renamed, marked as left and brought back to active', async () => {
    expect(await actions.savePersonAction(key(), null, {name: 'Elena Vogt', email: 'Elena.V@Meridian.example '})).toEqual({ok: true});
    const [elena] = await api.listPeople();
    expect(elena.email).toBe('elena.v@meridian.example');

    await actions.savePersonAction(key(), elena.id, {name: 'Elena Vogt-Lind', email: elena.email});
    expect((await api.listPeople())[0].name).toBe('Elena Vogt-Lind');

    expect(await actions.markPersonLeftAction(key(), elena.id, '2026-11-20')).toEqual({ok: true});
    expect(await api.listPeople()).toEqual([]);

    expect(await actions.markPersonActiveAction(key(), elena.id)).toEqual({ok: true});
    expect((await api.listPeople())[0]).toMatchObject({status: PERSON_STATUS.active, leftOn: null});
  });

  it('AC9: a rejected save shows the API message, and a reused idempotency key says it was used for different values', async () => {
    const {priya, marcus} = await seedPeople();

    const missingName = await actions.createAppAction(key(), {...atlasBoard(priya.id, marcus.id), name: '  '});
    expect(missingName).toMatchObject({ok: false, error: 'App name is required'});

    const reused = key();
    await actions.createAppAction(reused, atlasBoard(priya.id, marcus.id));
    const conflict = await actions.createAppAction(reused, {...atlasBoard(priya.id, marcus.id), name: 'Atlas Board 2'});
    expect(conflict).toMatchObject({ok: false, error: ACTION_MESSAGE.idempotencyConflict});
    expect(await api.listApps()).toHaveLength(1);
  });

  // Edge cases.

  it('clearing an optional field on edit clears it in the register', async () => {
    const {appId} = await seedApp();
    const values = appToForm(await api.getApp(appId));

    await actions.updateAppAction(key(), appId, {...values, vendor: '   ', noticeDeadline: '', cost: null});

    expect(await api.getApp(appId)).toMatchObject({vendor: null, noticeDeadline: null, costCents: null});
  });

  it('a cost with cents is stored as whole cents', async () => {
    const {priya, marcus} = await seedPeople();
    const {appId} = await actions.createAppAction(key(), {...atlasBoard(priya.id, marcus.id), cost: 1234.56});
    expect((await api.getApp(appId!)).costCents).toBe(123456);
  });

  it('a save after the app was archived says the record no longer exists', async () => {
    const {appId} = await seedApp();
    const values = appToForm(await api.getApp(appId));
    await actions.archiveAppAction(key(), appId);

    const result = await actions.updateAppAction(key(), appId, {...values, vendor: 'Too late'});

    expect(result).toEqual({ok: false, error: ACTION_MESSAGE.notFound});
  });

  // Security.

  it('an id with slashes stays inside its path segment and cannot reach another API route', async () => {
    const {priya} = await seedApp();

    const result = await actions.markPersonLeftAction(key(), `${priya.id}/../${priya.id}`, '2026-11-20');
    const viaApp = await actions.removeDependencyAction(`x/../../people/${priya.id}`, 'y');
    const dotDot = await actions.archiveAppAction(key(), '..');

    expect(result).toEqual({ok: false, error: ACTION_MESSAGE.notFound});
    expect(viaApp).toEqual({ok: false, error: ACTION_MESSAGE.notFound});
    expect(dotDot).toEqual({ok: false, error: ACTION_MESSAGE.notFound});
    expect((await api.listPeople()).map((person) => person.name)).toContain('Priya Chen');
  });

  it('an unexpected API failure shows a generic message, never the API key or error details', async () => {
    const failing = vi.fn(async () => {
      throw new Error(`connect ECONNREFUSED with ${process.env[ENV.apiKey]}`);
    });
    vi.stubGlobal('fetch', failing);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await actions.savePersonAction(key(), null, {name: 'Eve', email: 'eve@example.test'});

    expect(result).toEqual({ok: false, error: ACTION_MESSAGE.unexpected});
    expect(JSON.stringify(logged.mock.calls)).not.toContain(process.env[ENV.apiKey]);
  });
});
