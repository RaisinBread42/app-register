import {and, asc, eq} from 'drizzle-orm';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {DEPENDENCY_NAME_MAX_LENGTH, DEPENDENCY_VERSION_MAX_LENGTH, type HealthStatus} from '@/lib/constants';
import {appDependencies, type AppDependencyRow} from '@/lib/db/schema';
import {normaliseAdvisories} from './advisories';
import {assertActiveApp} from './app-scope';
import {dependencyStatus, UNCHECKED} from './dependency-health';
import {isUniqueViolation, NotFoundError, ValidationError} from './errors';
import {atMost, optionalText, requiredText} from './validation';

export type DependencyInput = {
  name: string;
  currentVersion: string;
  latestVersion?: string | null;
  vulnerabilities?: string[];
  recommendedAction?: string | null;
};

/** JSON shape of an app dependency in the API: the row plus its own status. */
export type DependencyView = Omit<AppDependencyRow, 'workspaceId'> & {status: HealthStatus};

/** An app's dependencies (archived apps too, as history), by name. */
export async function listDependencies(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
): Promise<DependencyView[]> {
  if (!isUuid(appId)) {
    return [];
  }
  const rows = await db
    .select()
    .from(appDependencies)
    .where(and(eq(appDependencies.workspaceId, workspaceId), eq(appDependencies.appId, appId)))
    .orderBy(asc(appDependencies.name));
  return rows.map(toView);
}

export async function addDependency(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  input: DependencyInput,
): Promise<DependencyView> {
  await assertActiveApp(db, workspaceId, appId);
  const values = validateDependency(input);
  return withNameCheck(async () => {
    const [row] = await db
      .insert(appDependencies)
      .values({id: newId(), workspaceId, appId, ...values})
      .returning();
    return toView(row);
  });
}

export async function updateDependency(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  id: string,
  patch: Partial<DependencyInput>,
): Promise<DependencyView> {
  await assertActiveApp(db, workspaceId, appId);
  const current = await findDependency(db, workspaceId, appId, id);
  const values = validateDependency({...current, ...patch});
  const isRenamed = values.name !== current.name;
  const isSamePackage = !isRenamed && values.currentVersion === current.currentVersion;
  // The stored latest version was the old package's; one the caller sends with the rename is kept.
  const isOldLatest = isRenamed && values.latestVersion === current.latestVersion;
  const monitoring = {...(isSamePackage ? {} : UNCHECKED), ...(isOldLatest ? {latestVersion: null} : {})};
  return withNameCheck(async () => {
    const [row] = await db
      .update(appDependencies)
      .set({...values, ...monitoring})
      .where(eq(appDependencies.id, current.id))
      .returning();
    return toView(row);
  });
}

export async function removeDependency(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  id: string,
): Promise<void> {
  await assertActiveApp(db, workspaceId, appId);
  const current = await findDependency(db, workspaceId, appId, id);
  await db.delete(appDependencies).where(eq(appDependencies.id, current.id));
}

async function findDependency(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  id: string,
): Promise<AppDependencyRow> {
  const [row] = isUuid(id)
    ? await db
        .select()
        .from(appDependencies)
        .where(
          and(
            eq(appDependencies.workspaceId, workspaceId),
            eq(appDependencies.appId, appId),
            eq(appDependencies.id, id),
          ),
        )
    : [];
  if (!row) {
    throw new NotFoundError('Dependency not found');
  }
  return row;
}

/** A dependency's name: required, and no longer than npm allows (a longer one would not fit the unique index either). */
export function dependencyName(value: unknown): string {
  return atMost(requiredText(value, 'dependency name'), DEPENDENCY_NAME_MAX_LENGTH, 'dependency name');
}

/** A dependency's version, range or tag: required, with a length cap. `label` names it in the 400. */
export function dependencyVersion(value: unknown, label: string): string {
  return atMost(requiredText(value, label), DEPENDENCY_VERSION_MAX_LENGTH, label);
}

function validateDependency(input: DependencyInput) {
  const latestVersion = optionalText(input.latestVersion, 'latest version');
  return {
    name: dependencyName(input.name),
    currentVersion: dependencyVersion(input.currentVersion, 'current version'),
    latestVersion: latestVersion && atMost(latestVersion, DEPENDENCY_VERSION_MAX_LENGTH, 'latest version'),
    vulnerabilities: textList(input.vulnerabilities),
    recommendedAction: optionalText(input.recommendedAction, 'recommended action'),
  };
}

/** A list of advisory ids: trimmed, blanks and repeats dropped. */
function textList(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ValidationError('vulnerabilities must be a list of advisory ids');
  }
  return [...new Set(value.map((item: string) => item.trim()).filter(Boolean))];
}

/** Dependency names are unique per app (case-insensitive). */
async function withNameCheck<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError('This app already lists a dependency with that name');
    }
    throw error;
  }
}

function toView(row: AppDependencyRow): DependencyView {
  return {
    id: row.id,
    appId: row.appId,
    name: row.name,
    currentVersion: row.currentVersion,
    latestVersion: row.latestVersion,
    vulnerabilities: row.vulnerabilities,
    recommendedAction: row.recommendedAction,
    source: row.source,
    isDev: row.isDev,
    advisories: normaliseAdvisories(row.advisories),
    checkedAt: row.checkedAt,
    checkError: row.checkError,
    status: dependencyStatus(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
