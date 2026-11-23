import {beforeEach, describe, expect, it} from 'vitest';
import {
  DEPENDENCY_CHECK_ERROR,
  DEPENDENCY_NAME_MAX_LENGTH,
  DEPENDENCY_VERSION_MAX_LENGTH,
  HEALTH_STATUS,
  MONITORING_MAX_RESPONSE_BYTES,
  OSV_API_URL,
  OSV_MAX_PAGES,
  RANGE_VERSION_POINTS,
} from '@/lib/constants';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {archiveApp, createApp, getApp, listActiveApps} from './apps';
import {addDependency, listDependencies, updateDependency} from './dependencies';
import {refreshDependencyHealth, refreshWorkspaceDependencyHealth} from './dependency-health';
import {importDependencies, parsePackageFile} from './dependency-import';
import {ValidationError} from './errors';
import {computeHealth} from './health';
import {createPackageSources, type Fetch, type PackageSources} from './package-sources';
import {isExactVersion, stripRange, versionLag} from './package-versions';
import {createPerson} from './people';
import {fakeRegistry} from './test/fake-registry';

/** Rules an adversarial review of dependency import and monitoring found broken; each test failed before its fix. */
describe('review regressions: dependency import and monitoring', () => {
  let t: TestDb;
  let ownerId: string;
  let backupId: string;
  let appId: string;

  const newApp = async (name: string) =>
    (await createApp(t.db, t.workspaceId, {name, kind: 'saas', ownerId, backupOwnerId: backupId})).id;
  const add = (name: string, currentVersion: string, app = appId) => addDependency(t.db, t.workspaceId, app, {name, currentVersion});
  const byName = async (app = appId) =>
    Object.fromEntries((await listDependencies(t.db, t.workspaceId, app)).map((d) => [d.name, d]));
  const packageJson = (dependencies: Record<string, string>) => JSON.stringify({name: 'x', dependencies});
  const importFile = (file: string) => importDependencies(t.db, t.workspaceId, appId, file);
  const refresh = (fetch: Fetch) => refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fetch)});
  const health = async () => (await getApp(t.db, t.workspaceId, appId)).health;

  /** OSV answering one advisory whose detail document is `detail`. */
  function osvAnswering(detail: unknown): Fetch {
    const base = fakeRegistry({latest: {'quill-forms': '3.9.0'}}).fetch;
    return async (url, init) => {
      if (url === `${OSV_API_URL}/querybatch`) {
        return Response.json({results: [{vulns: [{id: 'GHSA-evil-0000-0000'}]}]});
      }
      if (url.startsWith(`${OSV_API_URL}/vulns/`)) {
        return Response.json(detail);
      }
      return base(url, init);
    };
  }

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'})).id;
    backupId = (await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'})).id;
    appId = await newApp('Harbor Portal');
  });

  describe('advisories from the outside are never trusted', () => {
    it('a malformed advisory (aliases not a list) does not make the app list and detail unreadable', async () => {
      await add('quill-forms', '3.9.0');
      await refresh(osvAnswering({id: 'GHSA-evil-0000-0000', aliases: 7, summary: 'x'}));
      await expect(listActiveApps(t.db, t.workspaceId)).resolves.toBeDefined();
      await expect(getApp(t.db, t.workspaceId, appId)).resolves.toBeDefined();
      expect((await byName())['quill-forms'].advisories).toMatchObject([{id: 'GHSA-evil-0000-0000', aliases: [], summary: 'x'}]);
    });

    it('a malformed advisory (summary not text, aliases not ids) is stored with text only, and long text is cut', async () => {
      await add('quill-forms', '3.9.0');
      await refresh(osvAnswering({id: 'GHSA-evil-0000-0000', aliases: [{a: 1}], summary: {html: '<img onerror=1>'}}));
      const [dependency] = await listDependencies(t.db, t.workspaceId, appId);
      expect(dependency.advisories).toHaveLength(1);
      for (const advisory of dependency.advisories) {
        expect(typeof advisory.summary).toBe('string');
        expect(advisory.aliases.every((alias) => typeof alias === 'string')).toBe(true);
      }

      await refresh(osvAnswering({aliases: ['CVE-2026-0001', 'x'.repeat(5000), 9], summary: 'y'.repeat(5000), database_specific: {severity: 'bogus'}}));
      expect((await byName())['quill-forms'].advisories).toEqual([
        {id: 'GHSA-evil-0000-0000', aliases: ['CVE-2026-0001'], severity: 'unknown', summary: 'y'.repeat(300), url: 'https://osv.dev/vulnerability/GHSA-evil-0000-0000'},
      ]);
    });

    it('a summary cut inside an emoji, or holding a NUL, is stored as clean text; a repeated alias is stored once', async () => {
      await add('quill-forms', '3.9.0');
      const summary = `${'y'.repeat(298)}\u0000\u{1F600}`;
      await refresh(osvAnswering({aliases: ['CVE-2026-0001', 'CVE-2026-0001', 'CVE-\u0000'], summary}));
      expect((await byName())['quill-forms'].advisories).toEqual([
        {id: 'GHSA-evil-0000-0000', aliases: ['CVE-2026-0001'], severity: 'unknown', summary: 'y'.repeat(298), url: 'https://osv.dev/vulnerability/GHSA-evil-0000-0000'},
      ]);
    });

    it('an advisory id recorded by hand that is too long or holds a NUL is refused, never a failed write', async () => {
      const input = (id: string) => ({name: 'quill-forms', currentVersion: '3.9.0', vulnerabilities: [id]});
      await expect(addDependency(t.db, t.workspaceId, appId, input('C'.repeat(101)))).rejects.toThrow(ValidationError);
      await expect(addDependency(t.db, t.workspaceId, appId, input('CVE-\u0000'))).rejects.toThrow(ValidationError);
      expect((await addDependency(t.db, t.workspaceId, appId, input('C'.repeat(100)))).vulnerabilities).toEqual(['C'.repeat(100)]);
    });

    it('an advisory id from OSV cannot become a javascript: or off-site link', async () => {
      await add('quill-forms', '3.9.0');
      await refresh(osvAnswering({id: 'javascript:alert(1)//../../x?y#z', summary: '<script>alert(1)</script>'}));
      const [dependency] = await listDependencies(t.db, t.workspaceId, appId);
      expect(dependency.advisories).toHaveLength(1);
      for (const advisory of dependency.advisories) {
        expect(new URL(advisory.url).origin).toBe('https://osv.dev');
        expect(new URL(advisory.url).pathname.startsWith('/vulnerability/')).toBe(true);
      }
    });

    it('answers that are HTML, the wrong types, 429, 500 or longer than the size cap never throw and never overwrite good data', async () => {
      await add('quill-forms', '3.9.0');
      await refresh(
        fakeRegistry({latest: {'quill-forms': '5.0.2'}, advisories: {'quill-forms@3.9.0': [{id: 'GHSA-qqqq-1111-aaaa', severity: 'HIGH'}]}}).fetch,
      );
      const answers: (() => Response)[] = [
        () => new Response('<html>blocked</html>', {status: 200, headers: {'content-type': 'text/html'}}),
        () => Response.json({version: 12}),
        () => Response.json(null),
        () => Response.json([]),
        () => new Response('slow down', {status: 429}),
        () => new Response('boom', {status: 500}),
        () => Response.json({results: 'nope', version: {}}),
        () => Response.json({results: [{vulns: 'x'}], version: '5.0.2'}),
        () => Response.json({results: [{vulns: [null]}], version: '5.0.2'}),
        () => Response.json({results: [{vulns: [{id: 5}]}], version: '5.0.2', id: 5}),
        () => Response.json({results: [], version: '5.0.2'}),
        () => Response.json({version: '9'.repeat(DEPENDENCY_VERSION_MAX_LENGTH + 1)}),
        () => Response.json({version: '9.9.9', results: [{}], padding: 'x'.repeat(MONITORING_MAX_RESPONSE_BYTES)}),
      ];
      for (const [index, answer] of answers.entries()) {
        await expect(refresh(async () => answer()), `answer ${index}`).resolves.toMatchObject({unavailable: 1});
        await expect(listActiveApps(t.db, t.workspaceId), `list after answer ${index}`).resolves.toBeDefined();
      }
      const [dependency] = await listDependencies(t.db, t.workspaceId, appId);
      expect(dependency.latestVersion).toBe('5.0.2');
      expect(dependency.advisories.map((a) => a.id)).toEqual(['GHSA-qqqq-1111-aaaa']);
      expect(dependency.checkError).toBe(DEPENDENCY_CHECK_ERROR.unavailable);
    });

    it('a long list of advisories is read page by page (next_page_token), for a bounded number of pages', async () => {
      await add('quill-forms', '3.9.0');
      const base = fakeRegistry({latest: {'quill-forms': '3.9.0'}}).fetch;
      let batchCalls = 0;
      const tokens: unknown[] = [];
      let isEndless = false;
      const fetch: Fetch = async (url, init) => {
        if (url === `${OSV_API_URL}/querybatch`) {
          batchCalls++;
          tokens.push((JSON.parse(String(init?.body)) as {queries: {page_token?: string}[]}).queries[0].page_token);
          return batchCalls === 1 || isEndless
            ? Response.json({results: [{vulns: [{id: `GHSA-page-0001-000${batchCalls}`}], next_page_token: 'more'}]})
            : Response.json({results: [{vulns: [{id: 'GHSA-page-0002-0002'}]}]});
        }
        if (url.startsWith(`${OSV_API_URL}/vulns/`)) {
          return Response.json({id: decodeURIComponent(url.split('/').pop() ?? ''), database_specific: {severity: 'CRITICAL'}});
        }
        return base(url, init);
      };
      await refresh(fetch);
      expect((await byName())['quill-forms'].advisories.map((a) => a.id)).toEqual(['GHSA-page-0001-0001', 'GHSA-page-0002-0002']);
      expect(tokens).toEqual([undefined, 'more']);

      batchCalls = 0;
      isEndless = true;
      await refresh(fetch);
      expect(batchCalls).toBe(OSV_MAX_PAGES);
    });
  });

  describe('a dependency is ok only when the registry and OSV both answered for its name and version', () => {
    it('a dependency whose first check failed (sources down) has no status, is not ok, and says why', async () => {
      await add('quill-forms', '3.9.0');
      const summary = await refresh(fakeRegistry({latest: {}, down: ['quill-forms'], isOsvDown: true}).fetch);
      expect(summary.unavailable).toBe(1);
      const [dependency] = await listDependencies(t.db, t.workspaceId, appId);
      expect(dependency).toMatchObject({status: HEALTH_STATUS.na, checkedAt: null, checkError: DEPENDENCY_CHECK_ERROR.unavailable});
    });

    it('with the registry up but OSV down, a dependency never checked for advisories is not ok', async () => {
      await add('quill-forms', '3.9.0');
      await refresh(fakeRegistry({latest: {'quill-forms': '3.9.0'}, isOsvDown: true}).fetch);
      const [dependency] = await listDependencies(t.db, t.workspaceId, appId);
      expect(dependency).toMatchObject({status: HEALTH_STATUS.na, checkedAt: null, checkError: DEPENDENCY_CHECK_ERROR.unavailable});
    });

    it('an app whose dependencies are all unchecked has no score; one complete check gives it a score', async () => {
      await importFile(packageJson({'quill-forms': '3.9.0', 'harbor-private-sdk': '1.0.0'}));
      expect(await health()).toMatchObject({score: null, status: HEALTH_STATUS.na, dimensions: {dependencies: {status: HEALTH_STATUS.na, deductions: []}}});

      await refresh(fakeRegistry({latest: {}, down: ['quill-forms']}).fetch);
      expect((await byName())['harbor-private-sdk']).toMatchObject({status: HEALTH_STATUS.na, checkError: DEPENDENCY_CHECK_ERROR.notFound});
      expect(await health()).toMatchObject({score: null, status: HEALTH_STATUS.na});

      await refresh(fakeRegistry({latest: {'quill-forms': '3.9.0'}}).fetch);
      expect((await byName())['quill-forms'].status).toBe(HEALTH_STATUS.ok);
      expect(await health()).toMatchObject({score: 100, status: HEALTH_STATUS.ok});
    });

    it('a check that runs out of time leaves the rest unchecked for the next refresh instead of holding up the response', async () => {
      await add('quill-forms', '3.9.0');
      await add('tally-ui', '1.0.0');
      const real = createPackageSources(fakeRegistry({latest: {'quill-forms': '3.9.0', 'tally-ui': '1.0.0'}}).fetch);
      let advisoryCalls = 0;
      const slow: PackageSources = {
        async latestVersion(name, signal) {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return real.latestVersion(name, signal);
        },
        advisories(packages, signal) {
          advisoryCalls++;
          return real.advisories(packages, signal);
        },
      };
      const summary = await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: slow, budgetMs: 20});
      expect(summary).toEqual({checked: 0, notFound: 0, unavailable: 0, advisories: 0});
      expect(advisoryCalls).toBe(0);
      for (const dependency of await listDependencies(t.db, t.workspaceId, appId)) {
        expect(dependency).toMatchObject({status: HEALTH_STATUS.na, checkedAt: null, checkError: null});
      }

      await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: slow});
      expect((await byName())['quill-forms'].status).toBe(HEALTH_STATUS.ok);
    });
  });

  describe('a version that is not exact cannot be checked for advisories, and says so', () => {
    it('a major-only version is still compared with the latest: "^16" is a major version behind 19.0.0', () => {
      const [pkg] = parsePackageFile(packageJson({'quill-forms': '^16'}));
      expect(pkg.currentVersion).toBe('16');
      expect(versionLag(pkg.currentVersion, '19.0.0')).toBe('major');
      expect(versionLag('4.x', '5.1.0')).toBe('major');
      expect(versionLag('16', '16.4.0')).toBeNull();
      expect(versionLag('3.9', '3.10.2')).toBe('minor');
    });

    it('a range is never ok: it needs attention, costs 1 point and tells the user to import the lockfile', async () => {
      await importFile(packageJson({'quill-forms': '~3.9', 'tally-ui': '*', 'harbor-http': ''}));
      const {fetch, requests} = fakeRegistry({latest: {'quill-forms': '3.9.0', 'tally-ui': '1.0.0', 'harbor-http': '1.0.0'}});
      await refresh(fetch);

      expect(requests.some((r) => r.url.startsWith(OSV_API_URL))).toBe(false);
      for (const dependency of await listDependencies(t.db, t.workspaceId, appId)) {
        expect(dependency, dependency.name).toMatchObject({status: HEALTH_STATUS.attention, checkError: DEPENDENCY_CHECK_ERROR.invalidVersion});
      }
      const {score, dimensions} = await health();
      expect(score).toBe(100 - 3 * RANGE_VERSION_POINTS);
      expect(dimensions.dependencies?.deductions).toContainEqual({
        dimension: 'dependencies',
        label: 'quill-forms 3.9 is not an exact version',
        detail: 'Advisories cannot be checked for a range; import package-lock.json for exact versions',
        points: 1,
      });
    });

    it('an empty range in a package.json means any version and is imported as "*"', () => {
      expect(parsePackageFile(packageJson({'quill-forms': ''}))).toEqual([{name: 'quill-forms', currentVersion: '*', isDev: false}]);
    });
  });

  describe('what monitoring found belongs to one name and version', () => {
    it('renaming a dependency drops the old package’s latest version, advisories and check state', async () => {
      const added = await add('quill-forms', '3.9.0');
      const {fetch} = fakeRegistry({
        latest: {'quill-forms': '5.0.2'},
        advisories: {'quill-forms@3.9.0': [{id: 'GHSA-qqqq-1111-aaaa', severity: 'CRITICAL'}]},
      });
      await refresh(fetch);
      const renamed = await updateDependency(t.db, t.workspaceId, appId, added.id, {name: 'harbor-private-sdk'});
      expect(renamed).toMatchObject({latestVersion: null, advisories: [], checkedAt: null, checkError: null, status: HEALTH_STATUS.na});

      await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: createPackageSources(fetch), only: [added.id]});
      const [dependency] = await listDependencies(t.db, t.workspaceId, appId);
      expect((await health()).dimensions.dependencies?.deductions).toEqual([]);
      expect(dependency).toMatchObject({name: 'harbor-private-sdk', latestVersion: null});
    });

    it('an import that changes a version clears the old version’s advisories and check state', async () => {
      await importFile(packageJson({'quill-forms': '3.9.0'}));
      await refresh(
        fakeRegistry({latest: {'quill-forms': '5.0.2'}, advisories: {'quill-forms@3.9.0': [{id: 'GHSA-qqqq-1111-aaaa', severity: 'CRITICAL'}]}}).fetch,
      );
      expect((await byName())['quill-forms'].status).toBe(HEALTH_STATUS.critical);

      await importFile(packageJson({'quill-forms': '5.0.2'}));
      expect((await byName())['quill-forms']).toMatchObject({currentVersion: '5.0.2', advisories: [], checkedAt: null, checkError: null, status: HEALTH_STATUS.na});
    });

    it('a refresh that overlaps an import does not attach the old version’s advisories to the new version', async () => {
      await importFile(packageJson({'quill-forms': '3.9.0'}));
      const real = createPackageSources(
        fakeRegistry({
          latest: {'quill-forms': '5.0.2'},
          advisories: {'quill-forms@3.9.0': [{id: 'GHSA-qqqq-1111-aaaa', severity: 'CRITICAL', summary: 'old version only'}]},
        }).fetch,
      );
      const slow: PackageSources = {
        latestVersion: real.latestVersion,
        async advisories(packages) {
          const found = await real.advisories(packages);
          // The upgrade lands while the check is in flight.
          await importFile(packageJson({'quill-forms': '5.0.2'}));
          return found;
        },
      };
      await refreshDependencyHealth(t.db, t.workspaceId, appId, {sources: slow});
      const [dependency] = await listDependencies(t.db, t.workspaceId, appId);
      expect(dependency).toMatchObject({currentVersion: '5.0.2', advisories: [], checkedAt: null, status: HEALTH_STATUS.na});
    });
  });

  describe('what counts as a package file', () => {
    it('a JSON object that merely has a "name" is refused and does not wipe imported dependencies', async () => {
      await importFile(packageJson({'quill-forms': '3.9.0'}));
      await expect(importFile(JSON.stringify({name: 'Ada Owner', email: 'ada@example.test'}))).rejects.toThrow(ValidationError);
      expect(Object.keys(await byName())).toEqual(['quill-forms']);
    });

    it('an npm alias is recorded under the real package name, from a lockfile and from a package.json', () => {
      const lock = {
        name: 'x',
        lockfileVersion: 3,
        packages: {
          '': {dependencies: {'forms-old': 'npm:quill-forms@3.9.0'}},
          'node_modules/forms-old': {name: 'quill-forms', version: '3.9.0'},
        },
      };
      expect(parsePackageFile(JSON.stringify(lock))).toEqual([{name: 'quill-forms', currentVersion: '3.9.0', isDev: false}]);
      expect(parsePackageFile(packageJson({'forms-old': 'npm:quill-forms@^3.9.0', kit: 'npm:@harbor/ui-kit@3.4.2', any: 'npm:@harbor/http'}))).toEqual([
        {name: 'quill-forms', currentVersion: '3.9.0', isDev: false},
        {name: '@harbor/ui-kit', currentVersion: '3.4.2', isDev: false},
        {name: '@harbor/http', currentVersion: '*', isDev: false},
      ]);
    });

    it('optional dependencies are imported as runtime dependencies', () => {
      const file = JSON.stringify({
        optionalDependencies: {'harbor-native': '^2.1.0', 'quill-forms': '^3.0.0'},
        devDependencies: {'harbor-native': '^1.0.0'},
        dependencies: {'quill-forms': '3.9.0'},
      });
      expect(parsePackageFile(file)).toEqual([
        {name: 'harbor-native', currentVersion: '2.1.0', isDev: false},
        {name: 'quill-forms', currentVersion: '3.9.0', isDev: false},
      ]);
      expect(parsePackageFile('{"optionalDependencies": {}}')).toEqual([]);
    });

    it('two names that are the same after trimming are refused with a message naming the package, not a database error', async () => {
      const file = packageJson({'quill-forms': '1.0.0', ' quill-forms': '2.0.0'});
      await expect(importFile(file)).rejects.toThrow(ValidationError);
      await expect(importFile(file)).rejects.toThrow(/"quill-forms" is listed more than once in "dependencies"/);
      expect(await byName()).toEqual({});
    });

    it('a name longer than npm allows, or a far too long version, is refused on import and when added or edited by hand', async () => {
      const longName = 'n'.repeat(DEPENDENCY_NAME_MAX_LENGTH + 1);
      const longVersion = '1'.repeat(DEPENDENCY_VERSION_MAX_LENGTH + 1);
      let randomName = '';
      while (randomName.length < 20_000) randomName += Math.random().toString(36).slice(2);

      for (const file of [packageJson({[randomName]: '1.0.0'}), packageJson({[longName]: '1.0.0'}), packageJson({'quill-forms': longVersion})]) {
        await expect(importFile(file)).rejects.toThrow(ValidationError);
      }
      await expect(importFile(packageJson({[longName]: '1.0.0'}))).rejects.toThrow(/Dependency name is longer than 214 characters/);
      await expect(importFile(packageJson({'quill-forms': longVersion}))).rejects.toThrow(/Version of quill-forms is longer than 256 characters/);

      await expect(add(randomName, '1.0.0')).rejects.toThrow(ValidationError);
      await expect(add(longName, '1.0.0')).rejects.toThrow(/Dependency name is longer than 214 characters/);
      await expect(add('quill-forms', longVersion)).rejects.toThrow(/Current version is longer than 256 characters/);
      const added = await add('n'.repeat(DEPENDENCY_NAME_MAX_LENGTH), '1.0.0');
      await expect(updateDependency(t.db, t.workspaceId, appId, added.id, {name: longName})).rejects.toThrow(ValidationError);
      await expect(updateDependency(t.db, t.workspaceId, appId, added.id, {latestVersion: longVersion})).rejects.toThrow(ValidationError);
      expect(Object.keys(await byName())).toEqual(['n'.repeat(DEPENDENCY_NAME_MAX_LENGTH)]);
    });

    it('hostile keys (__proto__, constructor) are plain names, and 50,000 dependencies parse quickly', () => {
      const hostile = '{"name":"x","dependencies":{"__proto__":"1.0.0","constructor":"1.0.0","toString":"2.0.0"}}';
      const parsed = parsePackageFile(hostile);
      expect(parsed.map((p) => p.name).sort()).toEqual(['__proto__', 'constructor', 'toString']);
      expect(({} as {isDev?: unknown}).isDev).toBeUndefined();
      const lock =
        '{"lockfileVersion":3,"packages":{"":{"dependencies":{"a":"1"}},"__proto__":{"version":"9.9.9"},"node_modules/a":{"version":"1.2.3"}}}';
      expect(parsePackageFile(lock)).toEqual([{name: 'a', currentVersion: '1.2.3', isDev: false}]);

      const many: Record<string, string> = {};
      for (let i = 0; i < 50_000; i++) many[`pkg-${i}`] = `^1.${i}.0`;
      const started = Date.now();
      expect(parsePackageFile(packageJson(many))).toHaveLength(50_000);
      expect(Date.now() - started).toBeLessThan(3000);
    });
  });

  it('an app archived while the workspace refresh runs is skipped and the other apps are still checked', async () => {
    const second = await newApp('Tally Billing');
    await add('quill-forms', '3.9.0');
    await add('tally-ui', '1.0.0', second);
    const real = createPackageSources(fakeRegistry({latest: {'quill-forms': '3.9.0', 'tally-ui': '1.0.0'}}).fetch);
    let archived = false;
    const sources: PackageSources = {
      async latestVersion(name) {
        if (!archived) {
          archived = true;
          // Archive whichever app is NOT being checked right now.
          await archiveApp(t.db, t.workspaceId, name === 'quill-forms' ? second : appId);
        }
        return real.latestVersion(name);
      },
      advisories: real.advisories,
    };
    await expect(refreshWorkspaceDependencyHealth(t.db, t.workspaceId, sources)).resolves.toMatchObject({apps: 1, checked: 1});
  });

  it('version parsing has no catastrophic backtracking', () => {
    const started = Date.now();
    isExactVersion('1.0.0-' + 'a-.'.repeat(200_000) + '!');
    isExactVersion('1.0.0-' + '-'.repeat(500_000) + '+');
    stripRange('^~>=<v '.repeat(200_000) + 'x');
    stripRange(' '.repeat(1_000_000) + '1.0.0 ' + ' '.repeat(100_000));
    versionLag('9'.repeat(100_000) + '.1', '1.' + '9'.repeat(100_000));
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('a name that is not an npm package name is never sent to the registry as another path', async () => {
    const names = ['../../etc', '@scope/..', '..', 'a/../b', 'a?x=1', 'a#frag', '%2e%2e%2f', '@a/b/c', 'a\\b', 'registry.npmjs.org@evil.test', '@/x', 'a'.repeat(300)];
    for (const name of names) await add(name, '1.0.0').catch(() => undefined);
    const {fetch, requests} = fakeRegistry({latest: {}});
    await refresh(fetch);
    expect(requests.map((r) => r.url)).toEqual([]);
  });

  it('the score bands and version comparisons hold at their boundaries', () => {
    const d = (points: number) => ({dimension: 'dependencies' as const, label: '', detail: '', points});
    expect(computeHealth([d(20)])).toEqual({score: 80, status: 'attention'});
    expect(computeHealth([d(21)])).toEqual({score: 79, status: 'critical'});
    expect(computeHealth([d(5)])).toEqual({score: 95, status: 'ok'});
    expect(computeHealth([d(6)])).toEqual({score: 94, status: 'attention'});
    expect(computeHealth([d(1000)])).toEqual({score: 0, status: 'critical'});
    expect(versionLag('1.0.0-beta', '1.0.0')).toBeNull();
    expect(versionLag('latest', '2.0.0')).toBeNull();
    expect(versionLag('workspace:*', '2.0.0')).toBeNull();
    expect(versionLag('2.0.0', '1.9.0')).toBeNull();
    expect(versionLag('1.9.0', '1.10.0')).toBe('minor');
    for (const v of ['file:../x', 'git+https://example.test/x.git', 'npm:alias@1', 'workspace:*', 'latest']) {
      expect(stripRange(v)).toBe(v);
    }
  });
});
