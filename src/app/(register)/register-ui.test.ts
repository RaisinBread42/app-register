import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  APP_HEALTH_FILTER,
  APP_LIST_SORT,
  END_OF_SUPPORT_SOURCE,
  ENV,
  FILTER_ALL,
  HEALTH_STATUS,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  PERSON_STATUS,
} from '@/lib/constants';
import {fetchFromRoutes} from '@/lib/api/test/client';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApiKey} from '@/lib/services/api-keys';
import {fakeRegistry} from '@/lib/services/test/fake-registry';
import {ACTION_MESSAGE} from '@/lib/ui/action-result';
import {createApiClient, type ApiClient, type Hosting} from '@/lib/ui/api-client';
import {appToForm, emptyAppForm, hostingToForm, type AppFormValues} from '@/lib/ui/forms';
import {
  applyAppListView,
  appsWithRenewal,
  endOfSupportNote,
  healthStats,
  hostingStatusReason,
  openIncidents,
} from '@/lib/ui/register-view';
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

  /** The UI server reaches the API through the route handlers; anything else is the (fake) npm registry and OSV. */
  function stubRegistry() {
    const registry = fakeRegistry({
      latest: {'quill-forms': '5.0.2', 'tally-ui': '2.4.9', 'lint-kit': '9.2.0'},
      advisories: {
        'quill-forms@3.9.0': [
          {id: 'GHSA-qqqq-1111-aaaa', severity: 'CRITICAL', summary: 'Template injection in quill-forms'},
          {id: 'GHSA-qqqq-4444-dddd', severity: 'CRITICAL', summary: 'Remote code execution in quill-forms'},
        ],
      },
    });
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
      input.startsWith('http://register.test') ? fetchFromRoutes(input, init) : registry.fetch(input, init),
    );
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

    const bySoonestRenewal = applyAppListView(apps, {query: '', kind: FILTER_ALL, health: FILTER_ALL, sort: APP_LIST_SORT.renewal});
    expect(bySoonestRenewal.map((app) => [app.name, app.kind, app.owner.name, app.renewalDate])).toEqual([
      ['Badge Printer', 'in_house', 'Marcus Okonkwo', '2098-01-15'],
      ['Atlas Board', 'saas', 'Priya Chen', '2099-06-30'],
    ]);
    const saasOnly = applyAppListView(apps, {query: '', kind: 'saas', health: FILTER_ALL, sort: APP_LIST_SORT.name});
    expect(saasOnly.map((app) => app.name)).toEqual(['Atlas Board']);
    const searched = applyAppListView(apps, {query: '  printer ', kind: FILTER_ALL, health: FILTER_ALL, sort: APP_LIST_SORT.name});
    expect(searched.map((app) => app.name)).toEqual(['Badge Printer']);
  });

  it('the overview lists renewals and upcoming notice deadlines from real app dates, soonest first, leaving out deadlines already passed', async () => {
    const {priya, marcus} = await seedPeople();
    await actions.createAppAction(key(), atlasBoard(priya.id, marcus.id));
    await actions.createAppAction(key(), {...atlasBoard(marcus.id, priya.id), name: 'Slate Chat', noticeDeadline: '2098-11-30', renewalDate: '2098-12-31'});
    await actions.createAppAction(key(), {...atlasBoard(marcus.id, priya.id), name: 'No Dates', noticeDeadline: '', renewalDate: ''});
    const apps = await api.listApps();

    expect(appsWithRenewal(apps).map((app) => app.name)).toEqual(['Slate Chat', 'Atlas Board']);
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
      runtime: 'Node.js',
      runtimeVersion: '22',
      endOfSupportOn: '2099-11-30',
      endOfSupportOnAtOpen: '',
    });
    const [hosting] = (await api.getApp(appId)).hosting;
    await actions.saveHostingAction(key(), appId, hosting.id, {
      provider: 'Azure',
      service: 'App Service',
      region: 'northeurope',
      version: '',
      runtime: '',
      runtimeVersion: '22',
      // The user cleared the date the form opened with: it goes back to the check.
      endOfSupportOn: '',
      endOfSupportOnAtOpen: '2099-11-30',
    });
    expect((await api.getApp(appId)).hosting[0]).toMatchObject({region: 'northeurope', runtime: null, runtimeVersion: null, endOfSupportOn: null});

    expect(await actions.removeDependencyAction(appId, dependency.id)).toEqual({ok: true});
    expect(await actions.removeHostingAction(appId, hosting.id)).toEqual({ok: true});
    const after = await api.getApp(appId);
    expect([after.dependencies, after.hosting]).toEqual([[], []]);
  });

  it('the Hosting tab flags support that has ended or ends within 90 days, lists each open incident once with outages first, and its edit form leaves a looked-up date to the check', async () => {
    const {appId} = await seedApp();
    const today = '2026-11-22';
    expect(endOfSupportNote('2026-07-31', today)).toEqual({label: 'Past end of support', tone: 'red'});
    expect(endOfSupportNote('2027-02-04', today)).toEqual({label: 'EOS in 74 days', tone: 'yellow'});
    expect(endOfSupportNote('2026-11-23', today)?.label).toBe('EOS in 1 day');
    expect(endOfSupportNote('2027-02-21', today)).toBeNull();

    await actions.saveHostingAction(key(), appId, null, {provider: 'Azure', service: 'Storage', region: 'centralus', version: '', runtime: '', runtimeVersion: '', endOfSupportOn: '2027-02-04', endOfSupportOnAtOpen: ''});
    const [stored] = (await api.getApp(appId)).hosting;
    expect(hostingToForm(stored).endOfSupportOn).toBe('2027-02-04');
    const lookedUp: Hosting = {...stored, endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate};
    expect(hostingToForm(lookedUp).endOfSupportOn).toBe('');

    const outage = {title: 'Storage errors in Central US', impact: INCIDENT_IMPACT.major, scope: INCIDENT_SCOPE.service, url: 'https://status.example.test/1', startedAt: null};
    const maintenance = {...outage, title: 'Planned network work', impact: INCIDENT_IMPACT.maintenance, url: 'https://status.example.test/2'};
    const rows = [
      {...stored, incidents: [maintenance, {...outage, scope: INCIDENT_SCOPE.provider}]},
      {...stored, service: 'App Service', incidents: [outage]},
    ];
    expect(openIncidents(rows).map((incident) => [incident.kind.label, incident.title, incident.affects])).toEqual([
      ['Outage', 'Storage errors in Central US', 'Azure Storage, Azure App Service'],
      ['Maintenance', 'Planned network work', 'Azure Storage'],
    ]);
  });

  it('a hosting row with no status says why beside it: the check failed, it has not been checked yet, or it is not monitored; "Check now" needs no Idempotency-Key', async () => {
    const {appId} = await seedApp();
    await actions.saveHostingAction(key(), appId, null, {provider: 'Azure', service: 'Storage', region: '', version: '', runtime: '', runtimeVersion: '', endOfSupportOn: '', endOfSupportOnAtOpen: ''});
    const [stored] = (await api.getApp(appId)).hosting;
    const unchecked: Hosting = {...stored, status: HEALTH_STATUS.na, healthError: null, healthCheckedAt: null, isMonitored: true};

    // No feed answers in this test, so the check after the save failed: the row is na with the reason, never ok.
    expect(stored.status).toBe(HEALTH_STATUS.na);
    expect(hostingStatusReason(stored)).toMatch(/^Check failed: Azure status could not be reached/);
    expect(hostingStatusReason(unchecked)).toBe('Not checked yet');
    expect(hostingStatusReason({...unchecked, isMonitored: false})).toBe('Not monitored');
    expect(hostingStatusReason({...unchecked, status: HEALTH_STATUS.ok})).toBeNull();
    expect((await api.getApp(appId)).health.dimensions.hosting).toEqual({status: HEALTH_STATUS.na, deductions: []});

    expect(await actions.refreshHostingAction(appId)).toEqual({ok: true});
  });

  it('importing a package file on the Dependencies tab reports what was added, updated and removed, and the page then shows versions, advisories and a score', async () => {
    const {appId} = await seedApp();
    stubRegistry();
    const lockfile = JSON.stringify({
      name: 'atlas-board',
      lockfileVersion: 3,
      packages: {
        '': {dependencies: {'quill-forms': '^3.9.0', 'tally-ui': '^2.4.0'}, devDependencies: {'lint-kit': '^9.0.0'}},
        'node_modules/quill-forms': {version: '3.9.0'},
        'node_modules/tally-ui': {version: '2.4.9'},
        'node_modules/lint-kit': {version: '9.2.0'},
      },
    });

    const first = await actions.importDependenciesAction(key(), appId, lockfile);
    expect(first).toEqual({ok: true, summary: {added: 3, updated: 0, unchanged: 0, removed: 0}});
    const second = await actions.importDependenciesAction(key(), appId, JSON.stringify({name: 'atlas-board', dependencies: {'quill-forms': '5.0.2'}}));
    expect(second.summary).toEqual({added: 0, updated: 1, unchanged: 0, removed: 2});
    expect(await actions.importDependenciesAction(key(), appId, 'not a package file')).toEqual({
      ok: false,
      error: 'The file must be JSON: send package.json or package-lock.json as the request body',
    });

    const app = await api.getApp(appId);
    expect(app.dependencies).toMatchObject([{name: 'quill-forms', currentVersion: '5.0.2', latestVersion: '5.0.2', advisories: [], status: HEALTH_STATUS.ok}]);
    expect(app.health).toMatchObject({score: 100, status: HEALTH_STATUS.ok});
    expect(await actions.refreshDependenciesAction(appId)).toEqual({ok: true});
  });

  it('the applications list sorts lowest health first and filters by needs attention or healthy; apps with no score come last and count in neither', async () => {
    const {priya, marcus} = await seedPeople();
    stubRegistry();
    const create = async (name: string, dependencies?: Record<string, string>) => {
      const {appId} = await actions.createAppAction(key(), {...atlasBoard(priya.id, marcus.id), name});
      if (dependencies) {
        await actions.importDependenciesAction(key(), appId!, JSON.stringify({name: 'x', dependencies}));
      }
    };
    await create('Atlas Board', {'tally-ui': '2.4.9'});
    await create('Customer Portal', {'quill-forms': '3.9.0'});
    await create('Slate Chat');
    const apps = await api.listApps();
    const list = (health: string) =>
      applyAppListView(apps, {query: '', kind: FILTER_ALL, health, sort: APP_LIST_SORT.health}).map((app) => [app.name, app.health.score]);

    // Customer Portal: 100 − 10 − 10 (two critical advisories) − 3 (a major version behind).
    expect(list(FILTER_ALL)).toEqual([['Customer Portal', 77], ['Atlas Board', 100], ['Slate Chat', null]]);
    expect(list(APP_HEALTH_FILTER.attention)).toEqual([['Customer Portal', 77]]);
    expect(list(APP_HEALTH_FILTER.healthy)).toEqual([['Atlas Board', 100]]);
    expect(healthStats(apps)).toEqual({average: 89, healthy: 1, needAttention: 1});
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
