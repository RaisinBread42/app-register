import {and, eq, inArray} from 'drizzle-orm';
import {DEPENDENCY_IMPORT_MAX_BYTES, DEPENDENCY_SOURCE} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {newId} from '@/lib/db/ids';
import {appDependencies} from '@/lib/db/schema';
import {assertActiveApp} from './app-scope';
import {ValidationError} from './errors';
import {stripRange} from './package-versions';
import {requiredText} from './validation';

/**
 * Import of an npm `package.json` or `package-lock.json`: the request body is
 * the file itself. Only direct dependencies are taken. A lockfile (npm 7+) gives
 * the exact installed versions; a package.json gives its ranges with the
 * operators stripped (`^16.4.6` → `16.4.6`).
 */

export type ImportedPackage = {name: string; currentVersion: string; isDev: boolean};

/** How many dependencies an import added, updated to a new version, left as they were, and removed. */
export type ImportSummary = {added: number; updated: number; unchanged: number; removed: number};

type Ranges = Record<string, string>;
type PackageSection = {version?: unknown; dependencies?: unknown; devDependencies?: unknown};
type PackageFile = PackageSection & {
  name?: unknown;
  lockfileVersion?: unknown;
  packages?: Record<string, PackageSection | undefined>;
};

const LOCKFILE_ROOT = '';
const LOCKFILE_MODULES_PREFIX = 'node_modules/';
const NOT_A_PACKAGE_FILE = 'This is not a package.json or package-lock.json';
const BYTES_PER_MB = 1024 * 1024;

/** The direct dependencies a package file lists. A name in both lists counts as a runtime dependency. */
export function parsePackageFile(text: string): ImportedPackage[] {
  if (Buffer.byteLength(text) > DEPENDENCY_IMPORT_MAX_BYTES) {
    throw new ValidationError(`The file is larger than ${DEPENDENCY_IMPORT_MAX_BYTES / BYTES_PER_MB} MB`);
  }
  const file = parseObject(text);
  const root = rootSection(file);
  const installed = (name: string) => file.packages?.[LOCKFILE_MODULES_PREFIX + name]?.version;

  const packages = new Map<string, ImportedPackage>();
  const lists: [Ranges, boolean][] = [
    [ranges(root.devDependencies, 'devDependencies'), true],
    [ranges(root.dependencies, 'dependencies'), false],
  ];
  for (const [list, isDev] of lists) {
    for (const [name, range] of Object.entries(list)) {
      const version = installed(name);
      packages.set(name.toLowerCase(), {
        name: requiredText(name, 'dependency name'),
        currentVersion: requiredText(typeof version === 'string' ? version : stripRange(range), `version of ${name}`),
        isDev,
      });
    }
  }
  return [...packages.values()];
}

/**
 * Makes an app's dependencies match a package file, by name (case-insensitive):
 * new names are added, known names get the file's version, and names the file no
 * longer lists are removed, but only if an earlier import created them.
 * Dependencies added by hand are never removed.
 */
export async function importDependencies(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  fileText: string,
): Promise<ImportSummary> {
  await assertActiveApp(db, workspaceId, appId);
  const packages = parsePackageFile(fileText);
  const summary: ImportSummary = {added: 0, updated: 0, unchanged: 0, removed: 0};

  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(appDependencies)
      .where(and(eq(appDependencies.workspaceId, workspaceId), eq(appDependencies.appId, appId)))
      .for('update');
    const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row]));

    for (const {name, currentVersion, isDev} of packages) {
      const known = byName.get(name.toLowerCase());
      byName.delete(name.toLowerCase());
      if (!known) {
        await tx
          .insert(appDependencies)
          .values({id: newId(), workspaceId, appId, name, currentVersion, isDev, source: DEPENDENCY_SOURCE.import});
        summary.added++;
      } else if (known.currentVersion !== currentVersion) {
        // What monitoring found was about the old version.
        await tx
          .update(appDependencies)
          .set({currentVersion, isDev, advisories: [], checkedAt: null, checkError: null})
          .where(eq(appDependencies.id, known.id));
        summary.updated++;
      } else {
        if (known.isDev !== isDev) {
          await tx.update(appDependencies).set({isDev}).where(eq(appDependencies.id, known.id));
        }
        summary.unchanged++;
      }
    }

    const gone = [...byName.values()].filter((row) => row.source === DEPENDENCY_SOURCE.import).map((row) => row.id);
    if (gone.length > 0) {
      await tx.delete(appDependencies).where(inArray(appDependencies.id, gone));
    }
    summary.removed = gone.length;
  });
  return summary;
}

function parseObject(text: string): PackageFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError('The file must be JSON: send package.json or package-lock.json as the request body');
  }
  if (!isObject(parsed)) {
    throw new ValidationError(NOT_A_PACKAGE_FILE);
  }
  return parsed as PackageFile;
}

/** Where the direct dependencies are listed: the lockfile's root package, or the package.json itself. */
function rootSection(file: PackageFile): PackageSection {
  if (file.lockfileVersion !== undefined) {
    const root = isObject(file.packages) ? file.packages[LOCKFILE_ROOT] : undefined;
    if (!isObject(root)) {
      throw new ValidationError(
        'This package-lock.json has no "packages" section: create it with npm 7 or newer, or send package.json',
      );
    }
    return root;
  }
  if (file.name === undefined && file.dependencies === undefined && file.devDependencies === undefined) {
    throw new ValidationError(NOT_A_PACKAGE_FILE);
  }
  return file;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A `{name: range}` section, or a 400 when it is anything else. */
function ranges(section: unknown, label: string): Ranges {
  if (section === undefined) {
    return {};
  }
  if (!isObject(section) || Object.values(section).some((range) => typeof range !== 'string')) {
    throw new ValidationError(`"${label}" must map package names to versions`);
  }
  return section as Ranges;
}
