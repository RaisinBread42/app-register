import {and, asc, eq} from 'drizzle-orm';
import {END_OF_SUPPORT_SOURCE, type EndOfSupportSource} from '@/lib/constants';
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
  /** Language runtime the service runs, e.g. `Node.js` with runtimeVersion `22`. */
  runtime?: string | null;
  runtimeVersion?: string | null;
  /** A date sent here is kept as typed; leave it null to have the hosting check look it up. */
  endOfSupportOn?: string | null;
};

/** What a hosting row is: a change to any of these makes a looked-up end-of-support date stale. */
const IDENTITY_FIELDS = ['provider', 'service', 'version', 'runtime', 'runtimeVersion'] as const;

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

/** Every hosting row in the workspace, grouped by app id (for the apps list). */
export async function hostingByApp(db: AppDatabase, workspaceId: string): Promise<Map<string, HostingView[]>> {
  const rows = await db.select().from(appHosting).where(eq(appHosting.workspaceId, workspaceId));
  const byApp = new Map<string, HostingView[]>();
  for (const row of rows) {
    byApp.set(row.appId, [...(byApp.get(row.appId) ?? []), toView(row)]);
  }
  return byApp;
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
      .values({
        id: newId(),
        workspaceId,
        appId,
        ...values,
        endOfSupportSource: values.endOfSupportOn ? END_OF_SUPPORT_SOURCE.manual : null,
      })
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
      .set({...values, ...endOfSupportAfterEdit(current, values)})
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

/**
 * A date the edit changes becomes a manual date (or none). A looked-up date
 * stays until the row turns into a different service, version or runtime.
 */
function endOfSupportAfterEdit(
  current: AppHostingRow,
  values: ReturnType<typeof validateHosting>,
): {endOfSupportOn: string | null; endOfSupportSource: EndOfSupportSource | null} {
  if (values.endOfSupportOn !== current.endOfSupportOn) {
    return {
      endOfSupportOn: values.endOfSupportOn,
      endOfSupportSource: values.endOfSupportOn ? END_OF_SUPPORT_SOURCE.manual : null,
    };
  }
  const isSameThing = IDENTITY_FIELDS.every((field) => values[field] === current[field]);
  if (isSameThing || current.endOfSupportSource === END_OF_SUPPORT_SOURCE.manual) {
    return {endOfSupportOn: current.endOfSupportOn, endOfSupportSource: current.endOfSupportSource};
  }
  return {endOfSupportOn: null, endOfSupportSource: null};
}

function validateHosting(input: HostingInput) {
  return {
    provider: requiredText(input.provider, 'provider'),
    service: requiredText(input.service, 'service'),
    region: optionalText(input.region, 'region'),
    version: optionalText(input.version, 'version'),
    runtime: optionalText(input.runtime, 'runtime'),
    runtimeVersion: optionalText(input.runtimeVersion, 'runtime version'),
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
    runtime: row.runtime,
    runtimeVersion: row.runtimeVersion,
    endOfSupportOn: row.endOfSupportOn,
    endOfSupportSource: row.endOfSupportSource,
    incidents: row.incidents,
    healthCheckedAt: row.healthCheckedAt,
    healthError: row.healthError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
