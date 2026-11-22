import {and, asc, eq} from 'drizzle-orm';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {appHosting, type AppHostingRow} from '@/lib/db/schema';
import {assertActiveApp} from './app-scope';
import {isUniqueViolation, NotFoundError, ValidationError} from './errors';
import {optionalDate, optionalText, requiredText} from './validation';

export type HostingInput = {
  provider: string;
  service: string;
  region?: string | null;
  version?: string | null;
  endOfSupportOn?: string | null;
};

/** JSON shape of one hosting row (a provider service an app runs on) in the API. */
export type HostingView = Omit<AppHostingRow, 'workspaceId'>;

/** An app's hosting rows (archived apps too, as history), by provider then service. */
export async function listHosting(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
): Promise<HostingView[]> {
  if (!isUuid(appId)) {
    return [];
  }
  const rows = await db
    .select()
    .from(appHosting)
    .where(and(eq(appHosting.workspaceId, workspaceId), eq(appHosting.appId, appId)))
    .orderBy(asc(appHosting.provider), asc(appHosting.service));
  return rows.map(toView);
}

export async function addHosting(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  input: HostingInput,
): Promise<HostingView> {
  await assertActiveApp(db, workspaceId, appId);
  const values = validateHosting(input);
  return withServiceCheck(async () => {
    const [row] = await db
      .insert(appHosting)
      .values({id: newId(), workspaceId, appId, ...values})
      .returning();
    return toView(row);
  });
}

export async function updateHosting(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  id: string,
  patch: Partial<HostingInput>,
): Promise<HostingView> {
  await assertActiveApp(db, workspaceId, appId);
  const current = await findHosting(db, workspaceId, appId, id);
  const values = validateHosting({...current, ...patch});
  return withServiceCheck(async () => {
    const [row] = await db
      .update(appHosting)
      .set(values)
      .where(eq(appHosting.id, current.id))
      .returning();
    return toView(row);
  });
}

export async function removeHosting(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  id: string,
): Promise<void> {
  await assertActiveApp(db, workspaceId, appId);
  const current = await findHosting(db, workspaceId, appId, id);
  await db.delete(appHosting).where(eq(appHosting.id, current.id));
}

async function findHosting(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  id: string,
): Promise<AppHostingRow> {
  const [row] = isUuid(id)
    ? await db
        .select()
        .from(appHosting)
        .where(
          and(
            eq(appHosting.workspaceId, workspaceId),
            eq(appHosting.appId, appId),
            eq(appHosting.id, id),
          ),
        )
    : [];
  if (!row) {
    throw new NotFoundError('Hosting entry not found');
  }
  return row;
}

function validateHosting(input: HostingInput) {
  return {
    provider: requiredText(input.provider, 'provider'),
    service: requiredText(input.service, 'service'),
    region: optionalText(input.region, 'region'),
    version: optionalText(input.version, 'version'),
    endOfSupportOn: optionalDate(input.endOfSupportOn, 'end of support date'),
  };
}

/** One row per provider + service + region on an app. */
async function withServiceCheck<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError('This app already lists that provider service in that region');
    }
    throw error;
  }
}

function toView(row: AppHostingRow): HostingView {
  return {
    id: row.id,
    appId: row.appId,
    provider: row.provider,
    service: row.service,
    region: row.region,
    version: row.version,
    endOfSupportOn: row.endOfSupportOn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
