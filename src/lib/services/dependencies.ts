import {and, asc, eq} from 'drizzle-orm';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {appDependencies, type AppDependencyRow} from '@/lib/db/schema';
import {assertActiveApp} from './app-scope';
import {isUniqueViolation, NotFoundError, ValidationError} from './errors';
import {optionalText, requiredText} from './validation';

export type DependencyInput = {
  name: string;
  currentVersion: string;
  latestVersion?: string | null;
  vulnerabilities?: string[];
  recommendedAction?: string | null;
};

/** JSON shape of an app dependency in the API. */
export type DependencyView = Omit<AppDependencyRow, 'workspaceId'>;

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
  return withNameCheck(async () => {
    const [row] = await db
      .update(appDependencies)
      .set(values)
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

function validateDependency(input: DependencyInput) {
  return {
    name: requiredText(input.name, 'dependency name'),
    currentVersion: requiredText(input.currentVersion, 'current version'),
    latestVersion: optionalText(input.latestVersion, 'latest version'),
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
