import {and, eq} from 'drizzle-orm';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {
  ADVISORY_ID_MAX_LENGTH,
  DEPENDENCY_NAME_MAX_LENGTH,
  DEPENDENCY_VERSION_MAX_LENGTH,
  type HealthStatus,
} from '@/lib/constants';
import {appDependencies} from '@/lib/db/schema';
import {isAdvisoryId} from './advisories';
import {assertActiveApp} from './app-scope';
import {clearFoundAdvisories, loadDependencies, replaceManualAdvisories, type DependencyRecord} from './dependency-advisories';
import {dependencyStatus, UNCHECKED} from './dependency-health';
import {isUniqueViolation, NotFoundError, ValidationError} from './errors';
import {syncAppNotices} from './notices';
import {atMost, optionalText, requiredText} from './validation';

export type DependencyInput = {
  name: string;
  currentVersion: string;
  latestVersion?: string | null;
  vulnerabilities?: string[];
  recommendedAction?: string | null;
};

/** JSON shape of an app dependency in the API: the row plus its own status. */
export type DependencyView = Omit<DependencyRecord, 'workspaceId'> & {status: HealthStatus};

const DEPENDENCY_NOT_FOUND = 'Dependency not found';

/** An app's dependencies (archived apps too, as history), by name. */
export async function listDependencies(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
): Promise<DependencyView[]> {
  if (!isUuid(appId)) {
    return [];
  }
  const rows = await loadDependencies(db, and(eq(appDependencies.workspaceId, workspaceId), eq(appDependencies.appId, appId)));
  return rows.map(toView);
}

/** One dependency, whichever app it is on. 404 outside the workspace. */
export async function getDependency(db: AppDatabase, workspaceId: string, id: string): Promise<DependencyView> {
  const [row] = isUuid(id)
    ? await loadDependencies(db, and(eq(appDependencies.workspaceId, workspaceId), eq(appDependencies.id, id)))
    : [];
  if (!row) {
    throw new NotFoundError(DEPENDENCY_NOT_FOUND);
  }
  return toView(row);
}

export async function addDependency(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  input: DependencyInput,
): Promise<DependencyView> {
  await assertActiveApp(db, workspaceId, appId);
  const {vulnerabilities, ...values} = validateDependency(input);
  return withNameCheck(() =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(appDependencies)
        .values({id: newId(), workspaceId, appId, ...values})
        .returning();
      await replaceManualAdvisories(tx, row, vulnerabilities);
      return toView({...row, vulnerabilities, advisories: []});
    }),
  );
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
  const {vulnerabilities, ...values} = validateDependency({...current, ...patch});
  const isRenamed = values.name !== current.name;
  const isSamePackage = !isRenamed && values.currentVersion === current.currentVersion;
  // The stored latest version was the old package's; one the caller sends with the rename is kept.
  const isOldLatest = isRenamed && values.latestVersion === current.latestVersion;
  const monitoring = {...(isSamePackage ? {} : UNCHECKED), ...(isOldLatest ? {latestVersion: null} : {})};
  return withNameCheck(() =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .update(appDependencies)
        .set({...values, ...monitoring})
        .where(eq(appDependencies.id, current.id))
        .returning();
      await replaceManualAdvisories(tx, row, vulnerabilities);
      if (!isSamePackage) {
        await clearFoundAdvisories(tx, row);
      }
      return toView(await findDependency(tx, workspaceId, appId, row.id));
    }),
  );
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
  // Its notices no longer apply to this app: they are marked resolved, never deleted.
  await syncAppNotices(db, workspaceId, appId);
}

async function findDependency(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  id: string,
): Promise<DependencyRecord> {
  const [row] = isUuid(id)
    ? await loadDependencies(
        db,
        and(eq(appDependencies.workspaceId, workspaceId), eq(appDependencies.appId, appId), eq(appDependencies.id, id)),
      )
    : [];
  if (!row) {
    throw new NotFoundError(DEPENDENCY_NOT_FOUND);
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
  const ids = [...new Set(value.map((item: string) => item.trim()).filter(Boolean))];
  if (!ids.every(isAdvisoryId)) {
    throw new ValidationError(`An advisory id is plain text of at most ${ADVISORY_ID_MAX_LENGTH} characters`);
  }
  return ids;
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

function toView(row: DependencyRecord): DependencyView {
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
    advisories: row.advisories,
    checkedAt: row.checkedAt,
    checkError: row.checkError,
    status: dependencyStatus(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
