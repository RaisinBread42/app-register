import {and, asc, eq} from 'drizzle-orm';
import {
  END_OF_SUPPORT_SOURCE,
  HOSTING_NAME_MAX_LENGTH,
  HOSTING_VERSION_MAX_LENGTH,
  type EndOfSupportSource,
  type HealthStatus,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {appHosting, type AppHostingRow} from '@/lib/db/schema';
import {todayIso} from '@/lib/notice-alerts';
import {assertActiveApp} from './app-scope';
import {isUniqueViolation, NotFoundError, ValidationError} from './errors';
import {hostingStatus, isMonitored} from './hosting-health';
import {normaliseCheckError, normaliseIncidents} from './hosting-incidents';
import {atMost, optionalDate, optionalText, requiredText} from './validation';

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

/** What the hosting check looked at: its answer is only stored while the row still has all of these. */
export const CHECKED_FIELDS = [...IDENTITY_FIELDS, 'region'] as const;

/**
 * A hosting row the check has not looked at. Every edit that changes one of
 * CHECKED_FIELDS puts the row back here: what the check found was about another
 * service, version or region.
 */
export const UNCHECKED: Pick<AppHostingRow, 'incidents' | 'healthCheckedAt' | 'healthError'> = {
  incidents: [],
  healthCheckedAt: null,
  healthError: null,
};

/** JSON shape of one hosting row (a provider service an app runs on) in the API: the row plus its own status. */
export type HostingView = Omit<AppHostingRow, 'workspaceId'> & {
  /** False for a row the check has nothing to look at: no end-of-support date and no watched status feed. */
  isMonitored: boolean;
  status: HealthStatus;
};

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
  const isSameThing = CHECKED_FIELDS.every((field) => values[field] === current[field]);
  return withServiceCheck(async () => {
    const [row] = await db
      .update(appHosting)
      .set({...values, ...endOfSupportAfterEdit(current, values), ...(isSameThing ? {} : UNCHECKED)})
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
    provider: atMost(requiredText(input.provider, 'provider'), HOSTING_NAME_MAX_LENGTH, 'provider'),
    service: atMost(requiredText(input.service, 'service'), HOSTING_NAME_MAX_LENGTH, 'service'),
    region: optionalUpTo(input.region, HOSTING_NAME_MAX_LENGTH, 'region'),
    version: optionalUpTo(input.version, HOSTING_VERSION_MAX_LENGTH, 'version'),
    runtime: optionalUpTo(input.runtime, HOSTING_NAME_MAX_LENGTH, 'runtime'),
    runtimeVersion: optionalUpTo(input.runtimeVersion, HOSTING_VERSION_MAX_LENGTH, 'runtime version'),
    endOfSupportOn: optionalDate(input.endOfSupportOn, 'end of support date'),
  };
}

function optionalUpTo(value: unknown, max: number, label: string): string | null {
  const text = optionalText(value, label);
  return text === null ? null : atMost(text, max, label);
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

/** The row as the API serves it. What the check stored is normalised again here, so a bad stored value never fails a read. */
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
    incidents: normaliseIncidents(row.incidents, row.provider),
    healthCheckedAt: row.healthCheckedAt,
    healthError: normaliseCheckError(row.healthError),
    isMonitored: isMonitored(row),
    status: hostingStatus(row, todayIso()),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
