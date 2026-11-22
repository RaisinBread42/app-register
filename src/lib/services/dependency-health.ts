import {and, asc, eq, inArray} from 'drizzle-orm';
import {
  ADVISORY_POINTS,
  ADVISORY_SEVERITY,
  DEPENDENCY_CHECK_ERROR,
  HEALTH_DIMENSION,
  HEALTH_STATUS,
  MAJOR_BEHIND_POINTS,
  MINOR_BEHIND_POINTS,
  VERSION_LAG,
  type AdvisorySeverity,
  type DependencyCheckError,
  type HealthStatus,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {appDependencies, apps, type AppDependencyRow, type StoredAdvisory} from '@/lib/db/schema';
import {activeAppsIn, assertActiveApp} from './app-scope';
import type {Deduction} from './health';
import {createPackageSources, isNpmPackageName, mapWithLimit, type PackageSources} from './package-sources';
import {isExactVersion, versionLag} from './package-versions';

/**
 * Dependency monitoring: what the npm registry and OSV know about each
 * dependency, and the health deductions that follow from it.
 */

/** What scoring reads from a dependency. */
export type DependencyFacts = Pick<
  AppDependencyRow,
  'name' | 'currentVersion' | 'latestVersion' | 'vulnerabilities' | 'advisories' | 'isDev' | 'checkedAt'
>;

/** What one refresh did. Every count is a number of dependencies, except `advisories`. */
export type RefreshSummary = {
  checked: number;
  /** Not on the public npm registry (private, misspelt, or not an npm package). */
  notFound: number;
  /** A source did not answer; the previous result was kept. */
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
export function knownAdvisories(dependency: DependencyFacts): Pick<StoredAdvisory, 'id' | 'severity' | 'summary'>[] {
  const found = new Set(
    dependency.advisories.flatMap((advisory) => [advisory.id, ...advisory.aliases]).map((id) => id.toUpperCase()),
  );
  const byHand = dependency.vulnerabilities
    .filter((id) => !found.has(id.toUpperCase()))
    .map((id) => ({id, severity: ADVISORY_SEVERITY.unknown, summary: 'Recorded by hand'}));
  return [...dependency.advisories, ...byHand];
}

/**
 * The points an app loses for its dependencies, or null when it records none.
 * - each known advisory: 10 critical, 5 high, 2 medium or unrated, 0 low;
 * - each runtime dependency a major version behind the latest: 3; a minor version behind: 1.
 * Dev dependencies lose points for advisories only: an old build tool is not a production risk.
 */
export function dependencyDeductions(dependencies: DependencyFacts[]): Deduction[] | null {
  if (dependencies.length === 0) {
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
  return deductions;
}

/**
 * One dependency's own status: `critical` with a critical or high advisory,
 * `attention` with anything else that costs points, `na` until it has been
 * checked, otherwise `ok`.
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
  /** Null keeps the stored value: the registry does not know the package, or did not answer. */
  latestVersion: string | null;
  /** Null keeps the stored advisories: the source did not answer, or the version cannot be matched. */
  advisories: StoredAdvisory[] | null;
  checkError: DependencyCheckError | null;
};

/**
 * Looks up the latest version and known advisories of an app's dependencies
 * (all of them, or only the ids given) and stores the answers on each row.
 * One package failing never fails the refresh: it is marked with a check error.
 */
export async function refreshDependencyHealth(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  options: {sources?: PackageSources; only?: string[]} = {},
): Promise<RefreshSummary> {
  await assertActiveApp(db, workspaceId, appId);
  const filters = [eq(appDependencies.workspaceId, workspaceId), eq(appDependencies.appId, appId)];
  if (options.only) {
    filters.push(inArray(appDependencies.id, options.only));
  }
  const rows = await db.select().from(appDependencies).where(and(...filters)).orderBy(asc(appDependencies.name));
  const results = await checkPackages(rows, options.sources ?? createPackageSources());

  const checkedAt = new Date();
  for (const result of results) {
    await db
      .update(appDependencies)
      .set({
        checkedAt,
        checkError: result.checkError,
        ...(result.latestVersion === null ? {} : {latestVersion: result.latestVersion}),
        ...(result.advisories === null ? {} : {advisories: result.advisories}),
      })
      .where(eq(appDependencies.id, result.id));
  }
  return summarize(results);
}

/** Refreshes every active app in the workspace, one app at a time. The daily job calls this. */
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
  const total = {apps: withDependencies.length, checked: 0, notFound: 0, unavailable: 0, advisories: 0};
  for (const app of withDependencies) {
    const summary = await refreshDependencyHealth(db, workspaceId, app.id, {sources});
    total.checked += summary.checked;
    total.notFound += summary.notFound;
    total.unavailable += summary.unavailable;
    total.advisories += summary.advisories;
  }
  return total;
}

async function checkPackages(rows: AppDependencyRow[], sources: PackageSources): Promise<CheckResult[]> {
  const results = await mapWithLimit(rows, (row) => checkRegistry(row, sources));

  // Advisories only for packages the registry knows, at a version they can be matched to.
  const matchable = results.flatMap((result, index) =>
    result.checkError === null ? [{result, name: rows[index].name, version: rows[index].currentVersion}] : [],
  );
  for (const item of matchable.filter(({version}) => !isExactVersion(version))) {
    item.result.checkError = DEPENDENCY_CHECK_ERROR.invalidVersion;
  }
  const exact = matchable.filter(({version}) => isExactVersion(version));
  if (exact.length === 0) {
    return results;
  }
  try {
    const advisories = await sources.advisories(exact.map(({name, version}) => ({name, version})));
    exact.forEach(({result}, index) => {
      result.advisories = advisories[index];
    });
  } catch {
    for (const {result} of exact) {
      result.checkError = DEPENDENCY_CHECK_ERROR.unavailable;
    }
  }
  return results;
}

async function checkRegistry(row: AppDependencyRow, sources: PackageSources): Promise<CheckResult> {
  const result: CheckResult = {id: row.id, latestVersion: null, advisories: null, checkError: null};
  if (!isNpmPackageName(row.name)) {
    return {...result, checkError: DEPENDENCY_CHECK_ERROR.notFound};
  }
  try {
    const latestVersion = await sources.latestVersion(row.name);
    return latestVersion === null ? {...result, checkError: DEPENDENCY_CHECK_ERROR.notFound} : {...result, latestVersion};
  } catch {
    return {...result, checkError: DEPENDENCY_CHECK_ERROR.unavailable};
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
