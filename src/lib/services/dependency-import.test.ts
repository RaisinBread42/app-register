import {beforeEach, describe, expect, it} from 'vitest';
import {DEPENDENCY_IMPORT_MAX_BYTES, DEPENDENCY_SOURCE} from '@/lib/constants';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApp} from './apps';
import {addDependency, listDependencies} from './dependencies';
import {importDependencies, parsePackageFile} from './dependency-import';
import {createPerson} from './people';

/** A fictional app's lockfile (npm 7+): two runtime and one dev dependency, plus a transitive package. */
const LOCKFILE = JSON.stringify({
  name: 'harbor-portal',
  lockfileVersion: 3,
  packages: {
    '': {
      name: 'harbor-portal',
      dependencies: {'@harbor/ui-kit': '^3.1.0', 'quill-forms': '~2.8.0'},
      devDependencies: {'lint-kit': '9.2.0'},
    },
    'node_modules/@harbor/ui-kit': {version: '3.4.2'},
    'node_modules/quill-forms': {version: '2.8.5'},
    'node_modules/lint-kit': {version: '9.2.0', dev: true},
    'node_modules/tiny-transitive': {version: '1.0.3'},
  },
});

describe('dependency import', () => {
  let t: TestDb;
  let appId: string;
  const names = async () =>
    (await listDependencies(t.db, t.workspaceId, appId)).map((d) => `${d.name}@${d.currentVersion}`).sort();

  beforeEach(async () => {
    t = await createTestDb();
    const owner = await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'});
    const backup = await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'});
    appId = (await createApp(t.db, t.workspaceId, {name: 'Harbor Portal', kind: 'saas', ownerId: owner.id, backupOwnerId: backup.id})).id;
  });

  it('importing a package-lock.json records the direct dependencies at their exact installed versions, with dev dependencies flagged and transitive packages left out', async () => {
    expect(await importDependencies(t.db, t.workspaceId, appId, LOCKFILE)).toEqual({added: 3, updated: 0, unchanged: 0, removed: 0});

    const dependencies = await listDependencies(t.db, t.workspaceId, appId);
    expect(dependencies.map((d) => [d.name, d.currentVersion, d.isDev, d.source]).sort()).toEqual([
      ['@harbor/ui-kit', '3.4.2', false, DEPENDENCY_SOURCE.import],
      ['lint-kit', '9.2.0', true, DEPENDENCY_SOURCE.import],
      ['quill-forms', '2.8.5', false, DEPENDENCY_SOURCE.import],
    ]);
  });

  it('importing a package.json records each range with its operators stripped, and keeps tags it cannot read as they are', () => {
    const packages = parsePackageFile(
      JSON.stringify({
        name: 'harbor-portal',
        dependencies: {'quill-forms': '^2.8.0', 'harbor-http': '>=1.2.0 <2', 'tally-ui': 'latest'},
        devDependencies: {'lint-kit': '~9.2.0', 'quill-forms': '^2.0.0'},
      }),
    );
    expect(packages).toEqual([
      {name: 'lint-kit', currentVersion: '9.2.0', isDev: true},
      {name: 'quill-forms', currentVersion: '2.8.0', isDev: false},
      {name: 'harbor-http', currentVersion: '1.2.0', isDev: false},
      {name: 'tally-ui', currentVersion: 'latest', isDev: false},
    ]);
  });

  it('a later import updates versions by name, adds new packages, and removes missing ones only if an import created them', async () => {
    await addDependency(t.db, t.workspaceId, appId, {name: 'Quill-Forms', currentVersion: '2.0.0'});
    await addDependency(t.db, t.workspaceId, appId, {name: 'sentinel-agent', currentVersion: '4.2.1'});
    await importDependencies(t.db, t.workspaceId, appId, LOCKFILE);
    expect(await names()).toEqual(['@harbor/ui-kit@3.4.2', 'Quill-Forms@2.8.5', 'lint-kit@9.2.0', 'sentinel-agent@4.2.1']);

    const next = JSON.stringify({
      name: 'harbor-portal',
      dependencies: {'@harbor/ui-kit': '3.5.0', 'harbor-http': '1.6.0'},
    });
    expect(await importDependencies(t.db, t.workspaceId, appId, next)).toEqual({added: 1, updated: 1, unchanged: 0, removed: 1});
    // lint-kit came from an import and is gone; the two added by hand stay, listed or not.
    expect(await names()).toEqual(['@harbor/ui-kit@3.5.0', 'Quill-Forms@2.8.5', 'harbor-http@1.6.0', 'sentinel-agent@4.2.1']);
  });

  it('a file that is not JSON, not a package file, or larger than the cap is refused and changes nothing', async () => {
    await importDependencies(t.db, t.workspaceId, appId, LOCKFILE);
    const before = await names();
    const tooLarge = JSON.stringify({name: 'x', description: 'y'.repeat(DEPENDENCY_IMPORT_MAX_BYTES)});

    for (const [file, message] of [
      ['{"name": "harbor-portal", ', /must be JSON/],
      ['{}', /not a package\.json/],
      ['["quill-forms"]', /not a package\.json/],
      ['{"compilerOptions": {"strict": true}}', /not a package\.json/],
      ['{"name": "harbor-portal", "version": "1.0.0"}', /not a package\.json/],
      ['{"name": "x", "dependencies": ["quill-forms"]}', /must map package names/],
      ['{"name": "x", "dependencies": {"quill-forms": 2}}', /must map package names/],
      [tooLarge, /larger than 5 MB/],
    ] as const) {
      await expect(importDependencies(t.db, t.workspaceId, appId, file), file.slice(0, 40)).rejects.toThrow(message);
    }
    expect(await names()).toEqual(before);
  });

  it('an old lockfile without a packages section (npm 6) is refused with advice instead of importing nothing', async () => {
    const npm6 = JSON.stringify({name: 'harbor-portal', lockfileVersion: 1, dependencies: {'quill-forms': {version: '2.8.5'}}});
    await expect(importDependencies(t.db, t.workspaceId, appId, npm6)).rejects.toThrow(/npm 7 or newer/);
  });

  it('a package.json with an empty dependency list is a valid import that removes what earlier imports added', async () => {
    await importDependencies(t.db, t.workspaceId, appId, LOCKFILE);
    expect(await importDependencies(t.db, t.workspaceId, appId, '{"name": "harbor-portal", "dependencies": {}}')).toEqual({added: 0, updated: 0, unchanged: 0, removed: 3});
  });
});
