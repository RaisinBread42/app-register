import {and, asc, eq, type SQL} from 'drizzle-orm';
import {ADVISORY_SEVERITY, ADVISORY_SOURCE, type AdvisorySource} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {newId} from '@/lib/db/ids';
import {appDependencies, dependencyAdvisories, dependencyAdvisoryAliases, type AppDependencyRow} from '@/lib/db/schema';
import {advisoryUrl, type Advisory} from './advisories';

/**
 * Reads and writes the advisories of dependencies: one row per advisory in
 * `dependency_advisories`, its other ids in `dependency_advisory_aliases`.
 */

/** What is known against one dependency: ids recorded by hand, and what the OSV check found. */
export type KnownAdvisories = {vulnerabilities: string[]; advisories: Advisory[]};

/** A dependency row with its advisories. */
export type DependencyRecord = AppDependencyRow & KnownAdvisories;

type DependencyKey = Pick<AppDependencyRow, 'id' | 'workspaceId'>;
type AdvisoryToStore = Pick<Advisory, 'id' | 'aliases' | 'severity' | 'summary'>;

/** The dependencies matching `where` (a filter on `app_dependencies`) with their advisories, by name. */
export async function loadDependencies(db: AppDatabase, where: SQL | undefined): Promise<DependencyRecord[]> {
  const rows = await db.select().from(appDependencies).where(where).orderBy(asc(appDependencies.name));
  if (rows.length === 0) {
    return [];
  }
  const known = await knownAdvisoriesByDependency(db, where);
  return rows.map((row) => ({...row, ...(known.get(row.id) ?? {vulnerabilities: [], advisories: []})}));
}

/** Advisories of the dependencies matching `where`, by dependency id, each list in the order it was stored. */
async function knownAdvisoriesByDependency(db: AppDatabase, where: SQL | undefined): Promise<Map<string, KnownAdvisories>> {
  const rows = await db
    .select({advisory: dependencyAdvisories, alias: dependencyAdvisoryAliases.alias})
    .from(dependencyAdvisories)
    .innerJoin(appDependencies, eq(appDependencies.id, dependencyAdvisories.dependencyId))
    .leftJoin(dependencyAdvisoryAliases, eq(dependencyAdvisoryAliases.advisoryRowId, dependencyAdvisories.id))
    .where(where)
    .orderBy(asc(dependencyAdvisories.position), asc(dependencyAdvisoryAliases.position));

  const byDependency = new Map<string, KnownAdvisories>();
  const byRowId = new Map<string, Advisory>();
  for (const {advisory: row, alias} of rows) {
    const known = byDependency.get(row.dependencyId) ?? {vulnerabilities: [], advisories: []};
    byDependency.set(row.dependencyId, known);
    if (row.source === ADVISORY_SOURCE.manual) {
      known.vulnerabilities.push(row.advisoryId);
      continue;
    }
    let advisory = byRowId.get(row.id);
    if (!advisory) {
      advisory = {id: row.advisoryId, aliases: [], severity: row.severity, summary: row.summary, url: advisoryUrl(row.advisoryId)};
      byRowId.set(row.id, advisory);
      known.advisories.push(advisory);
    }
    if (alias !== null) {
      advisory.aliases.push(alias);
    }
  }
  return byDependency;
}

/**
 * Makes the advisories one source recorded for a dependency exactly `advisories`.
 * Call it inside the transaction that changes the dependency.
 */
export async function replaceAdvisories(
  tx: AppDatabase,
  dependency: DependencyKey,
  source: AdvisorySource,
  advisories: AdvisoryToStore[],
): Promise<void> {
  const {id: dependencyId, workspaceId} = dependency;
  await tx
    .delete(dependencyAdvisories)
    .where(and(eq(dependencyAdvisories.dependencyId, dependencyId), eq(dependencyAdvisories.source, source)));
  if (advisories.length === 0) {
    return;
  }
  const rows = advisories.map((advisory, position) => ({
    id: newId(),
    workspaceId,
    dependencyId,
    advisoryId: advisory.id,
    source,
    severity: advisory.severity,
    summary: advisory.summary,
    position,
  }));
  await tx.insert(dependencyAdvisories).values(rows);
  const aliases = advisories.flatMap((advisory, index) =>
    advisory.aliases.map((alias, position) => ({workspaceId, advisoryRowId: rows[index].id, alias, position})),
  );
  if (aliases.length > 0) {
    await tx.insert(dependencyAdvisoryAliases).values(aliases);
  }
}

/** Records the advisory ids a person typed in, replacing the ones recorded before. */
export function replaceManualAdvisories(tx: AppDatabase, dependency: DependencyKey, ids: string[]): Promise<void> {
  const advisories = ids.map((id) => ({id, aliases: [], severity: ADVISORY_SEVERITY.unknown, summary: ''}));
  return replaceAdvisories(tx, dependency, ADVISORY_SOURCE.manual, advisories);
}

/** Forgets what the OSV check found: it was about another name or version. */
export function clearFoundAdvisories(tx: AppDatabase, dependency: DependencyKey): Promise<void> {
  return replaceAdvisories(tx, dependency, ADVISORY_SOURCE.osv, []);
}
