import {beforeEach, describe, expect, it} from 'vitest';
import {DEPENDENCY_CHECK_ERROR, HEALTH_STATUS, MONITORING_USER_AGENT} from '@/lib/constants';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {archiveApp, createApp, getApp} from './apps';
import {addDependency, listDependencies} from './dependencies';
import {refreshDependencyHealth, refreshWorkspaceDependencyHealth} from './dependency-health';
import {createPackageSources} from './package-sources';
import {createPerson} from './people';
import {fakeRegistry, type FakeRegistry} from './test/fake-registry';

const REGISTRY: FakeRegistry = {
  latest: {'quill-forms': '5.0.2', '@harbor/ui-kit': '3.4.2', 'tally-ui': '2.4.9'},
  advisories: {
    'quill-forms@3.9.0': [
      {id: 'GHSA-qqqq-1111-aaaa', severity: 'CRITICAL', summary: 'Template injection in quill-forms', aliases: ['CVE-2026-4411']},
      {id: 'GHSA-qqqq-2222-bbbb', severity: 'MODERATE', summary: 'Slow regular expression'},
      {id: 'GHSA-qqqq-3333-cccc', severity: 'HIGH', summary: 'Withdrawn report', withdrawn: '2026-10-01T00:00:00Z'},
    ],
  },
};

describe('dependency monitoring', () => {
  let t: TestDb;
  let ownerId: string;
  let backupId: string;
  let appId: string;

  const newApp = async (name: string) =>
    (await createApp(t.db, t.workspaceId, {name, kind: 'saas', ownerId, backupOwnerId: backupId})).id;
  const add = (name: string, currentVersion: string, app = appId) => addDependency(t.db, t.workspaceId, app, {name, currentVersion});
  const byName = async (app = appId) =>
    Object.fromEntries((await listDependencies(t.db, t.workspaceId, app)).map((d) => [d.name, d]));

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'})).id;
    backupId = (await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'})).id;
    appId = await newApp('Harbor Portal');
  });

  it('a refresh stores each dependency’s latest version, its advisories with severity, and when it was checked; a package the registry does not know is marked not found without failing the rest', async () => {
    await add('quill-forms', '3.9.0');
    await add('@harbor/ui-kit', '3.4.2');
    await add('harbor-private-sdk', '1.0.0');
    const {fetch} = fakeRegistry(REGISTRY);

    const summary = await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fetch)});
    expect(summary).toEqual({checked: 3, notFound: 1, unavailable: 0, advisories: 2});

    const dependencies = await byName();
    expect(dependencies['quill-forms']).toMatchObject({
      latestVersion: '5.0.2',
      checkError: null,
      status: HEALTH_STATUS.critical,
      advisories: [
        {id: 'GHSA-qqqq-1111-aaaa', aliases: ['CVE-2026-4411'], severity: 'critical', summary: 'Template injection in quill-forms', url: 'https://osv.dev/vulnerability/GHSA-qqqq-1111-aaaa'},
        {id: 'GHSA-qqqq-2222-bbbb', aliases: [], severity: 'medium', summary: 'Slow regular expression', url: 'https://osv.dev/vulnerability/GHSA-qqqq-2222-bbbb'},
      ],
    });
    expect(dependencies['quill-forms'].checkedAt).toBeInstanceOf(Date);
    expect(dependencies['@harbor/ui-kit']).toMatchObject({latestVersion: '3.4.2', advisories: [], checkError: null, status: HEALTH_STATUS.ok});
    expect(dependencies['harbor-private-sdk']).toMatchObject({latestVersion: null, advisories: [], checkError: DEPENDENCY_CHECK_ERROR.notFound});

    // 100 − 10 (critical) − 2 (medium) − 3 (quill-forms a major version behind).
    expect((await getApp(t.db, t.workspaceId, appId)).health).toMatchObject({score: 85, status: HEALTH_STATUS.attention});
  });

  it('the workspace refresh checks every active app that has dependencies and skips archived apps', async () => {
    const billing = await newApp('Tally Billing');
    const retired = await newApp('Old Intranet');
    await newApp('No Dependencies Yet');
    await add('quill-forms', '3.9.0');
    await add('tally-ui', '2.4.1', billing);
    await add('tally-ui', '1.0.0', retired);
    await archiveApp(t.db, t.workspaceId, retired);
    const {fetch} = fakeRegistry(REGISTRY);

    const summary = await refreshWorkspaceDependencyHealth(t.db, t.workspaceId, createPackageSources(fetch));
    expect(summary).toEqual({apps: 2, checked: 2, notFound: 0, unavailable: 0, advisories: 2});
    expect((await byName(billing))['tally-ui'].latestVersion).toBe('2.4.9');
    expect((await byName(retired))['tally-ui'].checkedAt).toBeNull();
  });

  it('when a source does not answer, the dependency is marked unavailable and keeps what the last check found', async () => {
    await add('quill-forms', '3.9.0');
    await add('tally-ui', '2.4.1');
    await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fakeRegistry(REGISTRY).fetch)});

    const registryDown = fakeRegistry({...REGISTRY, down: ['tally-ui']});
    expect(await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(registryDown.fetch)})).toMatchObject({unavailable: 1});
    expect((await byName())['tally-ui']).toMatchObject({latestVersion: '2.4.9', checkError: DEPENDENCY_CHECK_ERROR.unavailable});

    const osvDown = fakeRegistry({...REGISTRY, isOsvDown: true});
    expect(await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(osvDown.fetch)})).toMatchObject({unavailable: 2});
    expect((await byName())['quill-forms']).toMatchObject({checkError: DEPENDENCY_CHECK_ERROR.unavailable});
    expect((await byName())['quill-forms'].advisories).toHaveLength(2);
  });

  it('a tracked version that is a range or tag still gets its latest version, but is marked as not matchable to advisories', async () => {
    await add('quill-forms', 'latest');
    const {fetch, requests} = fakeRegistry(REGISTRY);

    await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fetch)});
    expect((await byName())['quill-forms']).toMatchObject({latestVersion: '5.0.2', advisories: [], checkError: DEPENDENCY_CHECK_ERROR.invalidVersion});
    expect(requests.map((r) => r.url)).toEqual(['https://registry.npmjs.org/quill-forms/latest']);
  });

  it('monitoring sends only package names and versions, as app-register, and never sends a name that is not an npm package name', async () => {
    await add('@harbor/ui-kit', '3.4.2');
    await add('quill-forms', '3.9.0');
    await add('SQL Server 2016 (finance cluster)', '13.0');
    await add('../../etc/passwd', '1.0.0');
    const {fetch, requests} = fakeRegistry(REGISTRY);

    await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fetch)});

    expect(requests.map((r) => `${r.method} ${r.url}`).sort()).toEqual([
      'GET https://api.osv.dev/v1/vulns/GHSA-qqqq-1111-aaaa',
      'GET https://api.osv.dev/v1/vulns/GHSA-qqqq-2222-bbbb',
      'GET https://api.osv.dev/v1/vulns/GHSA-qqqq-3333-cccc',
      'GET https://registry.npmjs.org/@harbor%2Fui-kit/latest',
      'GET https://registry.npmjs.org/quill-forms/latest',
      'POST https://api.osv.dev/v1/querybatch',
    ]);
    const batch = requests.find((r) => r.method === 'POST');
    expect(JSON.parse(batch?.body ?? '')).toEqual({
      queries: [
        {package: {name: '@harbor/ui-kit', ecosystem: 'npm'}, version: '3.4.2'},
        {package: {name: 'quill-forms', ecosystem: 'npm'}, version: '3.9.0'},
      ],
    });
    for (const request of requests) {
      expect(request.headers['user-agent']).toBe(MONITORING_USER_AGENT);
      const sent = JSON.stringify(request);
      for (const secret of ['Harbor Portal', 'Ada', 'example.test', t.workspaceId, appId, 'SQL Server', 'passwd']) {
        expect(sent, request.url).not.toContain(secret);
      }
    }
    expect((await byName())['SQL Server 2016 (finance cluster)'].checkError).toBe(DEPENDENCY_CHECK_ERROR.notFound);
  });
});
