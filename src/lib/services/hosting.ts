import {and, eq} from 'drizzle-orm';
import {
  END_OF_SUPPORT_SOURCE,
  HOSTING_NAME_MAX_LENGTH,
  HOSTING_VERSION_MAX_LENGTH,
  type HealthStatus,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {appHosting, type AppHostingRow} from '@/lib/db/schema';
import {todayIso} from '@/lib/notice-alerts';
import {assertActiveApp} from './app-scope';
import {isUniqueViolation, NotFoundError, ValidationError} from './errors';
import {hostingStatus, isMonitored} from './hosting-health';
import {loadHosting, normaliseCheckError, replaceIncidents, type HostingRecord} from './hosting-incidents';
import {atMost, optionalDate, optionalText, requiredText} from './validation';
import {syncAppNoticesSafely} from './notices';

export type HostingInput = {
  provider: string;
  service: string;
  region?: string | null;
  version?: string | null;
  /** Language runtime the service runs, e.g. `Node.js` with runtimeVersion `22`. */
  runtime?: string | null;
  runtimeVersion?: string | null;
  /**
   * A date sent here is a date set by hand, whatever it is: the hosting check never overwrites it.
   * On an edit, leave the field out to keep the date as it is, and send null to
   * hand a date set by hand back to the check. null does nothing to a looked-up date.
   */
  endOfSupportOn?: string | null;
};

/** What a hosting row is: a change to any of these makes a looked-up end-of-support date stale. */
const IDENTITY_FIELDS = ['provider', 'service', 'version', 'runtime', 'runtimeVersion'] as const;

/** What the hosting check looked at: its answer is only stored while the row still has all of these. */
export const CHECKED_FIELDS = [...IDENTITY_FIELDS, 'region'] as const;

/**
 * A hosting row the check has not looked at. An edit that changes one of
 * CHECKED_FIELDS, or hands the date back to the check, puts the row back here
 * (and forgets its incidents): what the check found was about another service,
 * version or region, or the date has yet to be looked up.
 */
const UNCHECKED: Pick<AppHostingRow, 'healthCheckedAt' | 'healthError' | 'lastGoodCheckAt'> = {
  healthCheckedAt: null,
  healthError: null,
  lastGoodCheckAt: null,
};

/** JSON shape of one hosting row (a provider service an app runs on) in the API: the row, its incidents and its own status. */
export type HostingView = Omit<HostingRecord, 'workspaceId'> & {
  /** False for a row the check has nothing to look at: no end-of-support date and no watched status feed. */
  isMonitored: boolean;
  status: HealthStatus;
};

const HOSTING_NOT_FOUND = 'Hosting entry not found';

/** An app's hosting rows (archived apps too, as history), by provider then service. */
export async function listHosting(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
): Promise<HostingView[]> {
  if (!isUuid(appId)) {
    return [];
  }
  const rows = await loadHosting(db, and(eq(appHosting.workspaceId, workspaceId), eq(appHosting.appId, appId)));
  return rows.map(toView);
}

/** One hosting entry, whichever app it is on. 404 outside the workspace. */
export async function getHosting(db: AppDatabase, workspaceId: string, id: string): Promise<HostingView> {
  const [row] = isUuid(id)
    ? await loadHosting(db, and(eq(appHosting.workspaceId, workspaceId), eq(appHosting.id, id)))
    : [];
  if (!row) {
    throw new NotFoundError(HOSTING_NOT_FOUND);
  }
  return toView(row);
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
    return toView({...row, incidents: []});
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
  const endOfSupport = endOfSupportAfterEdit(current, values, patch.endOfSupportOn !== undefined);
  const isHandedBack = current.endOfSupportSource === END_OF_SUPPORT_SOURCE.manual && endOfSupport.endOfSupportSource === null;
  const needsCheck = isHandedBack || CHECKED_FIELDS.some((field) => values[field] !== current[field]);
  await withServiceCheck(() =>
    db.transaction(async (tx) => {
      await tx
        .update(appHosting)
        .set({...values, ...endOfSupport, ...(needsCheck ? UNCHECKED : {})})
        .where(eq(appHosting.id, current.id));
      if (needsCheck) {
        await replaceIncidents(tx, current, []);
      }
    }),
  );
  // A date set by hand, or incidents cleared by the edit, change the app's notices now.
  await syncAppNoticesSafely(db, workspaceId, appId);
  return getHosting(db, workspaceId, current.id);
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
  await syncAppNoticesSafely(db, workspaceId, appId);
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
    throw new NotFoundError(HOSTING_NOT_FOUND);
  }
  return row;
}

type EndOfSupport = Pick<AppHostingRow, 'endOfSupportOn' | 'endOfSupportSource' | 'isVersionInexact'>;

const NO_END_OF_SUPPORT: EndOfSupport = {endOfSupportOn: null, endOfSupportSource: null, isVersionInexact: false};

/**
 * The end-of-support date after an edit.
 * - A date the client sent is a date set by hand, also when it equals the one looked up.
 * - null sent for a date set by hand hands it back to the check.
 * - Otherwise the date is left alone: a date set by hand always stays, and a
 *   looked-up one stays until the row turns into a different service, version or runtime.
 */
function endOfSupportAfterEdit(current: AppHostingRow, values: ReturnType<typeof validateHosting>, isDateSent: boolean): EndOfSupport {
  if (isDateSent && values.endOfSupportOn !== null) {
    return {endOfSupportOn: values.endOfSupportOn, endOfSupportSource: END_OF_SUPPORT_SOURCE.manual, isVersionInexact: false};
  }
  const isManual = current.endOfSupportSource === END_OF_SUPPORT_SOURCE.manual;
  if (isDateSent && isManual) {
    return NO_END_OF_SUPPORT;
  }
  const isSameThing = IDENTITY_FIELDS.every((field) => values[field] === current[field]);
  if (isManual || isSameThing) {
    return {endOfSupportOn: current.endOfSupportOn, endOfSupportSource: current.endOfSupportSource, isVersionInexact: current.isVersionInexact};
  }
  return NO_END_OF_SUPPORT;
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

/** The row as the API serves it. */
function toView(row: HostingRecord): HostingView {
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
    isVersionInexact: row.isVersionInexact,
    incidents: row.incidents,
    healthCheckedAt: row.healthCheckedAt,
    healthError: normaliseCheckError(row.healthError),
    lastGoodCheckAt: row.lastGoodCheckAt,
    isMonitored: isMonitored(row),
    status: hostingStatus(row, todayIso()),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
