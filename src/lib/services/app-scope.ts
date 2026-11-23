import {and, eq, isNull, type SQL} from 'drizzle-orm';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid} from '@/lib/db/ids';
import {apps} from '@/lib/db/schema';
import {NotFoundError} from './errors';

/** The one "active apps" filter every query shares. */
export function activeAppsIn(workspaceId: string): SQL {
  return and(eq(apps.workspaceId, workspaceId), isNull(apps.archivedAt)) as SQL;
}

/** 404 unless the id is an active app in this workspace. Used before writing an app's children. */
export async function assertActiveApp(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
): Promise<void> {
  const [row] = isUuid(appId) ? await activeApp(db, workspaceId, appId) : [];
  if (!row) {
    throw new NotFoundError('App not found');
  }
}

/**
 * `assertActiveApp` that also holds the app's row (`FOR UPDATE`) until the
 * transaction ends. Writers that start with this run one at a time per app.
 */
export async function lockActiveApp(
  tx: AppDatabase,
  workspaceId: string,
  appId: string,
): Promise<void> {
  const [row] = isUuid(appId) ? await activeApp(tx, workspaceId, appId).for('update') : [];
  if (!row) {
    throw new NotFoundError('App not found');
  }
}

function activeApp(db: AppDatabase, workspaceId: string, appId: string) {
  return db
    .select({id: apps.id})
    .from(apps)
    .where(and(activeAppsIn(workspaceId), eq(apps.id, appId)));
}
