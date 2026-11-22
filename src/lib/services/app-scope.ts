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
  const [row] = isUuid(appId)
    ? await db
        .select({id: apps.id})
        .from(apps)
        .where(and(activeAppsIn(workspaceId), eq(apps.id, appId)))
    : [];
  if (!row) {
    throw new NotFoundError('App not found');
  }
}
