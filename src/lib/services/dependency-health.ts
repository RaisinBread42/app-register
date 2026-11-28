import {and, asc, eq, inArray} from 'drizzle-orm';
import {
  ADVISORY_POINTS,
  ADVISORY_SEVERITY,
  ADVISORY_SOURCE,
  DEPENDENCY_CHECK_ERROR,
  MONITORING_FOLLOW_UP_BUDGET_MS,
  HEALTH_DIMENSION,
  HEALTH_STATUS,
  MAJOR_BEHIND_POINTS,
  MINOR_BEHIND_POINTS,
  RANGE_VERSION_POINTS,
  VERSION_LAG,
  type AdvisorySeverity,
  type DependencyCheckError,
  type HealthStatus,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {appDependencies, apps, type AppDependencyRow} from '@/lib/db/schema';
import type {Advisory} from './advisories';
import {activeAppsIn, assertActiveApp} from './app-scope';
import {replaceAdvisories, type KnownAdvisories} from './dependency-advisories';
import {NotFoundError} from './errors';
import type {Deduction} from './health';
import {syncAppNotices} from './notices';
import {createPackageSources, isNpmPackageName, mapWithLimit, type PackageSources} from './package-sources';
import {isExactVersion, versionLag} from './package-versions';

/**
 * Dependency monitoring: what the npm registry and OSV know about each
 * dependency, and the health deductions that follow from it.
 */

/** What scoring reads from a dependency. */
export type DependencyFacts = Pick<AppDependencyRow, 'name' | 'currentVersion' | 'latestVersion' | 'isDev' | 'checkedAt' | 'checkError'> &
  KnownAdvisories;

type MonitoringResults = Pick<AppDependencyRow, 'latestVersion' | 'checkedAt' | 'checkError'>;

/**
 * A dependency whose advisories have not been checked. Every write that changes
 * a dependency's name or version puts it back here and clears the advisories the
 * check found (`clearFoundAdvisories`): they were about another package or
 * version. (The latest version belongs to the name alone, so only a rename clears it.)
 */
export const UNCHECKED: Omit<MonitoringResults, 'latestVersion'> = {checkedAt: null, checkError: null};

/** What one refresh did. Every count is a number of dependencies, except `advisories`. */
export type RefreshSummary = {
  /** Dependencies a source was asked about (fewer than the app has when the check ran out of time). */
  checked: number;
  /** Not on the public npm registry (private, misspelt, or not an npm package). */
  notFound: number;
  /** A source gave no usable answer; the previous result was kept. */
  unavailable: number;
  /** Advisories now known across the checked dependencies. */
  advisories: number;
};

const SEVERITY_LABEL: Record<AdvisorySeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unknown: 'Unrated',
};

/** Severities that make a single dependency `critical` on their own. */
const URGENT_SEVERITIES: readonly AdvisorySeverity[] = [ADVISORY_SEVERITY.critical, ADVISORY_SEVERITY.high];

/**
 * Every advisory known for a dependency: what monitoring found, plus ids recorded
 * by hand that monitoring did not find (severity unknown).
 */
export function knownAdvisories(dependency: DependencyFacts): Pick<Advisory, 'id' | 'severity' | 'summary'>[] {
  const monitored = dependency.advisories;
  const found = new Set(monitored.flatMap((advisory) => [advisory.id, ...advisory.aliases]).map((id) => id.toUpperCase()));
  const byHand = dependency.vulnerabilities
    .filter((id) => !found.has(id.toUpperCase()))
    .map((id) => ({id, severity: ADVISORY_SEVERITY.unknown, summary: 'Recorded by hand'}));
  return [...monitored, ...byHand];
}

/**
 * The points an app loses for its dependencies, or null when there is nothing to
 * go on: it records none, or none of them has been checked yet.
 * - each known advisory: 10 critical, 5 high, 2 medium or unrated, 0 low;
 * - each runtime dependency a major version behind the latest: 3; a minor version behind: 1;
 * - each dependency whose version is a range or tag: 1, because its advisories cannot be checked.
 * Dev dependencies lose no points for being behind: an old build tool is not a production risk.
 */
export function dependencyDeductions(dependencies: DependencyFacts[]): Deduction[] | null {
  if (dependencies.every((dependency) => dependencyStatus(dependency) === HEALTH_STATUS.na)) {
    return null;
  }
  return dependencies.flatMap(deductionsFor);
}

function deductionsFor(dependency: DependencyFacts): Deduction[] {
  const dimension = HEALTH_DIMENSION.dependencies;
  const deductions: Deduction[] = knownAdvisories(dependency)
    .filter((advisory) => ADVISORY_POINTS[advisory.severity] > 0)
    .map((advisory) => ({
      dimension,
      label: `${SEVERITY_LABEL[advisory.severity]} advisory in ${dependency.name} ${dependency.currentVersion}`,
      detail: advisory.summary ? `${advisory.id} · ${advisory.summary}` : advisory.id,
      points: ADVISORY_POINTS[advisory.severity],
    }));

  const lag = dependency.isDev ? null : versionLag(dependency.currentVersion, dependency.latestVersion);
  if (lag) {
    deductions.push({
      dimension,
      label: `${dependency.name} is a ${lag} version behind`,
      detail: `${dependency.currentVersion} → ${dependency.latestVersion}`,
      points: lag === VERSION_LAG.major ? MAJOR_BEHIND_POINTS : MINOR_BEHIND_POINTS,
    });
  }
  if (dependency.checkError === DEPENDENCY_CHECK_ERROR.invalidVersion) {
    deductions.push({
      dimension,
      label: `${dependency.name} ${dependency.currentVersion} is not an exact version`,
      detail: 'Advisories cannot be checked for a range; import package-lock.json for exact versions',
      points: RANGE_VERSION_POINTS,
    });
  }
  return deductions;
}

/**
 * One dependency's own status: `critical` with a critical or high advisory,
 * `attention` with anything else that costs points (a version that is a range
 * always does). Otherwise `ok`, but only once the registry and the advisory
 * source have both answered for this name and version (`checkedAt` is set);
 * until then, and for a package the registry does not know, `na`.
 */
export function dependencyStatus(dependency: DependencyFacts): HealthStatus {
  if (knownAdvisories(dependency).some((advisory) => URGENT_SEVERITIES.includes(advisory.severity))) {
    return HEALTH_STATUS.critical;
  }
  if (deductionsFor(dependency).length > 0) {
    return HEALTH_STATUS.attention;
  }
  return dependency.checkedAt ? HEALTH_STATUS.ok : HEALTH_STATUS.na;
}

type CheckResult = {
  id: string;
  /** The name and version that were checked; the answer is only stored while the row still has them. */
  name: string;
  version: string;
  /** Null keeps the stored value: the registry does not know the package, or gave no usable answer. */
  latestVersion: string | null;
  /** Null keeps the stored advisories: the source gave no usable answer, or the version is not exact. */
  advisories: Advisory[] | null;
  checkError: DependencyCheckError | null;
};

export type RefreshOptions = {
  sources?: PackageSources;
  /** Check only these dependency ids. */
  only?: string[];
  /** Stop asking the sources after this long; what was not checked by then is left as it was. */
  budgetMs?: number;
};

/**
 * Looks up the latest version and known advisories of an app's dependencies
 * (all of them, or only the ids given) and stores the answers on each row.
 * One package failing never fails the refresh: it is marked with a check error.
 * An answer is dropped when the dependency's name or version changed meanwhile.
 */
export async function refreshDependencyHealth(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  options: RefreshOptions = {},
): Promise<RefreshSummary> {
  await assertActiveApp(db, workspaceId, appId);
  const filters = [eq(appDependencies.workspaceId, workspaceId), eq(appDependencies.appId, appId)];
  if (options.only) {
    filters.push(inArray(appDependencies.id, options.only));
  }
  const rows = await db.select().from(appDependencies).where(and(...filters)).orderBy(asc(appDependencies.name));
  const outOfTime = options.budgetMs === undefined ? undefined : AbortSignal.timeout(options.budgetMs);
  const results = await checkPackages(rows, options.sources ?? createPackageSources(), outOfTime);

  const now = new Date();
  for (const result of results) {
    await db.transaction((tx) => storeResult(tx, workspaceId, result, now));
  }
  await syncAppNotices(db, workspaceId, appId, now);
  return summarize(results);
}

/**
 * Stores one answer, but only while the row still has the name and version that
 * were checked. The row stays locked until the advisories are replaced, so a
 * rename cannot slip in between and keep them.
 */
async function storeResult(tx: AppDatabase, workspaceId: string, result: CheckResult, now: Date): Promise<void> {
  const stillSame = await tx
    .update(appDependencies)
    .set(toStore(result, now))
    .where(
      and(
        eq(appDependencies.id, result.id),
        eq(appDependencies.name, result.name),
        eq(appDependencies.currentVersion, result.version),
      ),
    )
    .returning({id: appDependencies.id});
  if (stillSame.length > 0 && result.advisories !== null) {
    await replaceAdvisories(tx, {id: result.id, workspaceId}, ADVISORY_SOURCE.osv, result.advisories);
  }
}

/**
 * The check that follows a write (import, add, edit). It gives up after
 * MONITORING_FOLLOW_UP_BUDGET_MS so the response is not held up; what was not
 * checked stays unchecked until the next refresh.
 */
export function checkAfterWrite(db: AppDatabase, workspaceId: string, appId: string, only?: string[]): Promise<RefreshSummary> {
  return refreshDependencyHealth(db, workspaceId, appId, {only, budgetMs: MONITORING_FOLLOW_UP_BUDGET_MS});
}

/**
 * Refreshes every active app in the workspace, one app at a time. The daily job
 * calls this. An app archived while it runs is skipped.
 */
export async function refreshWorkspaceDependencyHealth(
  db: AppDatabase,
  workspaceId: string,
  sources: PackageSources = createPackageSources(),
): Promise<RefreshSummary & {apps: number}> {
  const withDependencies = await db
    .selectDistinct({id: apps.id})
    .from(apps)
    .innerJoin(appDependencies, eq(appDependencies.appId, apps.id))
    .where(activeAppsIn(workspaceId));
  const total = {apps: 0, checked: 0, notFound: 0, unavailable: 0, advisories: 0};
  for (const app of withDependencies) {
    const summary = await refreshUnlessGone(db, workspaceId, app.id, sources);
    if (summary) {
      total.apps++;
      total.checked += summary.checked;
      total.notFound += summary.notFound;
      total.unavailable += summary.unavailable;
      total.advisories += summary.advisories;
    }
  }
  return total;
}

/** One app's refresh, or null when the app was archived since the list was read. */
async function refreshUnlessGone(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  sources: PackageSources,
): Promise<RefreshSummary | null> {
  try {
    return await refreshDependencyHealth(db, workspaceId, appId, {sources});
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
}

/**
 * What to write for one result. `checkedAt` is only set when the registry and
 * the advisory source both answered; when a source gave no answer the earlier
 * `checkedAt` stays, because the earlier answers are still about this version.
 */
function toStore(result: CheckResult, now: Date): Partial<MonitoringResults> {
  const checkedAt: Partial<MonitoringResults> =
    result.checkError === DEPENDENCY_CHECK_ERROR.unavailable ? {} : {checkedAt: result.checkError === null ? now : null};
  return {
    checkError: result.checkError,
    ...checkedAt,
    ...(result.latestVersion === null ? {} : {latestVersion: result.latestVersion}),
  };
}

/** The results for every row that was checked. Rows not reached before `outOfTime` aborts are left out. */
async function checkPackages(rows: AppDependencyRow[], sources: PackageSources, outOfTime?: AbortSignal): Promise<CheckResult[]> {
  const looked = await mapWithLimit(rows, (row) => checkRegistry(row, sources, outOfTime));
  const results = looked.filter((result) => result !== null);

  // Advisories only for packages the registry knows, and only at an exact version.
  const known = results.filter((result) => result.checkError === null);
  const exact = known.filter(({version}) => isExactVersion(version));
  for (const result of known.filter(({version}) => !isExactVersion(version))) {
    result.checkError = DEPENDENCY_CHECK_ERROR.invalidVersion;
  }
  if (exact.length === 0) {
    return results;
  }
  try {
    outOfTime?.throwIfAborted();
    const advisories = await sources.advisories(exact.map(({name, version}) => ({name, version})), outOfTime);
    exact.forEach((result, index) => {
      result.advisories = advisories[index];
    });
  } catch {
    if (outOfTime?.aborted) {
      return results.filter((result) => !exact.includes(result));
    }
    for (const result of exact) {
      result.checkError = DEPENDENCY_CHECK_ERROR.unavailable;
    }
  }
  return results;
}

/** What the registry says about one row, or null when there was no time left to ask. */
async function checkRegistry(row: AppDependencyRow, sources: PackageSources, outOfTime?: AbortSignal): Promise<CheckResult | null> {
  const result: CheckResult = {
    id: row.id,
    name: row.name,
    version: row.currentVersion,
    latestVersion: null,
    advisories: null,
    checkError: null,
  };
  if (!isNpmPackageName(row.name)) {
    return {...result, checkError: DEPENDENCY_CHECK_ERROR.notFound};
  }
  if (outOfTime?.aborted) {
    return null;
  }
  try {
    const latestVersion = await sources.latestVersion(row.name, outOfTime);
    return latestVersion === null ? {...result, checkError: DEPENDENCY_CHECK_ERROR.notFound} : {...result, latestVersion};
  } catch {
    return outOfTime?.aborted ? null : {...result, checkError: DEPENDENCY_CHECK_ERROR.unavailable};
  }
}

function summarize(results: CheckResult[]): RefreshSummary {
  const count = (error: DependencyCheckError) => results.filter((result) => result.checkError === error).length;
  return {
    checked: results.length,
    notFound: count(DEPENDENCY_CHECK_ERROR.notFound),
    unavailable: count(DEPENDENCY_CHECK_ERROR.unavailable),
    advisories: results.reduce((total, result) => total + (result.advisories?.length ?? 0), 0),
  };
}
