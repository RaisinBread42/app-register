import {and, eq, inArray} from 'drizzle-orm';
import {ANY_VERSION_RANGE, BYTES_PER_MB, DEPENDENCY_IMPORT_MAX_BYTES, DEPENDENCY_SOURCE} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {newId} from '@/lib/db/ids';
import {appDependencies} from '@/lib/db/schema';
import {lockActiveApp} from './app-scope';
import {dependencyName, dependencyVersion} from './dependencies';
import {UNCHECKED} from './dependency-health';
import {ValidationError} from './errors';
import {stripRange} from './package-versions';
import {isPlainObject} from './validation';

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
type Installed = Record<string, unknown>;

/**
 * The lists of direct dependencies, least important first: a name in several
 * lists is recorded once, as the last list here has it (so a runtime dependency
 * wins over a dev one). Optional dependencies are runtime dependencies.
 */
const SECTIONS = [
  {key: 'devDependencies', isDev: true},
  {key: 'optionalDependencies', isDev: false},
  {key: 'dependencies', isDev: false},
] as const;

const LOCKFILE_ROOT = '';
const LOCKFILE_MODULES_PREFIX = 'node_modules/';
/** `"forms-old": "npm:quill-forms@^3.9.0"` installs quill-forms under another name. */
const ALIAS_PREFIX = 'npm:';
const NOT_A_PACKAGE_FILE =
  'This is not a package.json or package-lock.json: it has no "dependencies", "devDependencies" or "optionalDependencies"';

/** The direct dependencies a package file lists, each once, under its real package name. */
export function parsePackageFile(text: string): ImportedPackage[] {
  if (Buffer.byteLength(text) > DEPENDENCY_IMPORT_MAX_BYTES) {
    throw new ValidationError(`The file is larger than ${DEPENDENCY_IMPORT_MAX_BYTES / BYTES_PER_MB} MB`);
  }
  const {root, installed} = readPackageFile(text);

  const packages = new Map<string, ImportedPackage>();
  for (const {key, isDev} of SECTIONS) {
    const inSection = new Set<string>();
    for (const [listedAs, range] of Object.entries(ranges(root[key], key))) {
      const {name, currentVersion} = importedPackage(listedAs, range, installed);
      const nameKey = name.toLowerCase();
      if (inSection.has(nameKey)) {
        throw new ValidationError(`"${name}" is listed more than once in "${key}"`);
      }
      inSection.add(nameKey);
      packages.set(nameKey, {name, currentVersion, isDev});
    }
  }
  return [...packages.values()];
}

/**
 * Makes an app's dependencies match a package file, by name (case-insensitive):
 * new names are added, known names get the file's version, and names the file no
 * longer lists are removed, but only if an earlier import created them.
 * Dependencies added by hand are never removed.
 *
 * Imports of one app run one at a time: each holds the app's row until it
 * commits, so two builds posting at once both succeed.
 */
export async function importDependencies(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  fileText: string,
): Promise<ImportSummary> {
  const summary: ImportSummary = {added: 0, updated: 0, unchanged: 0, removed: 0};

  await db.transaction(async (tx) => {
    await lockActiveApp(tx, workspaceId, appId);
    const packages = parsePackageFile(fileText);
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
          .set({currentVersion, isDev, ...UNCHECKED})
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

/**
 * Where the direct dependencies are listed (`root`) and, for a lockfile, what is
 * installed (`installed`, keyed `node_modules/<name>`).
 * A file counts as a package file only when it is a lockfile with a `packages`
 * section, or has at least one of the dependency lists (an empty one counts).
 * Anything else is refused, so a stray JSON file can never empty an app's dependencies.
 */
function readPackageFile(text: string): {root: Record<string, unknown>; installed: Installed} {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new ValidationError('The file must be JSON: send package.json or package-lock.json as the request body');
  }
  if (!isPlainObject(file)) {
    throw new ValidationError(NOT_A_PACKAGE_FILE);
  }
  if (file.lockfileVersion !== undefined) {
    const root = isPlainObject(file.packages) ? file.packages[LOCKFILE_ROOT] : undefined;
    if (!isPlainObject(file.packages) || !isPlainObject(root)) {
      throw new ValidationError(
        'This package-lock.json has no "packages" section: create it with npm 7 or newer, or send package.json',
      );
    }
    return {root, installed: file.packages};
  }
  if (SECTIONS.every(({key}) => file[key] === undefined)) {
    throw new ValidationError(NOT_A_PACKAGE_FILE);
  }
  return {root: file, installed: {}};
}

/** A `{name: range}` section, or a 400 when it is anything else. */
function ranges(section: unknown, label: string): Ranges {
  if (section === undefined) {
    return {};
  }
  if (!isPlainObject(section) || Object.values(section).some((range) => typeof range !== 'string')) {
    throw new ValidationError(`"${label}" must map package names to versions`);
  }
  return section as Ranges;
}

/**
 * One listed dependency as it is recorded.
 * - Name: the real package name, not an alias (the lockfile entry's `name`, or the
 *   name inside `npm:<name>@<range>`).
 * - Version: the installed version from a lockfile; otherwise the range with its
 *   operators stripped. An empty range means any version (`*`).
 */
function importedPackage(listedAs: string, range: string, installed: Installed): {name: string; currentVersion: string} {
  const alias = parseAlias(range.trim());
  const entry = installed[LOCKFILE_MODULES_PREFIX + listedAs];
  const lockfile = isPlainObject(entry) ? entry : {};
  const written = (alias?.range ?? range).trim() || ANY_VERSION_RANGE;

  const name = dependencyName(typeof lockfile.name === 'string' ? lockfile.name : (alias?.name ?? listedAs));
  const version = typeof lockfile.version === 'string' ? lockfile.version : stripRange(written);
  return {name, currentVersion: dependencyVersion(version, `version of ${name}`)};
}

/** `npm:quill-forms@^3.9.0` → quill-forms and `^3.9.0`; `npm:@harbor/ui-kit` → any version. Null when the range is no alias. */
function parseAlias(range: string): {name: string; range: string} | null {
  if (!range.startsWith(ALIAS_PREFIX)) {
    return null;
  }
  const target = range.slice(ALIAS_PREFIX.length);
  // A scoped name starts with "@", so only a later "@" separates the version.
  const at = target.lastIndexOf('@');
  return at > 0 ? {name: target.slice(0, at), range: target.slice(at + 1)} : {name: target, range: ANY_VERSION_RANGE};
}
