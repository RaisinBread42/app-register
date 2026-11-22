import {and, asc, between, eq, sql} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {APP_KINDS, APP_SORT, APP_SORTS, NOTICE_WINDOW_MAX_DAYS, type AppKind} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {apps, people} from '@/lib/db/schema';
import {addDaysIso, todayIso} from '@/lib/notice-alerts';
import {activeAppsIn} from './app-scope';
import {listDependencies, type DependencyView} from './dependencies';
import {isUniqueViolation, NotFoundError, ValidationError} from './errors';
import {listHosting, type HostingView} from './hosting';
import {
  listAlertsForApp,
  removeScheduledAlerts,
  scheduleAlerts,
  type NoticeAlertView,
} from './notice-alerts';
import {assertActivePeople} from './people';
import {optionalDate, optionalText} from './validation';

const IN_HOUSE_KINDS: readonly AppKind[] = ['in_house', 'citizen_built'];

/** Largest value the `cost_cents integer` column holds. */
const MAX_COST_CENTS = 2_147_483_647;

export type CreateAppInput = {
  name: string;
  kind: string;
  ownerId: string;
  backupOwnerId: string;
  category?: string | null;
  vendor?: string | null;
  description?: string | null;
  renewalDate?: string | null;
  noticeDeadline?: string | null;
  billingCycle?: string | null;
  costCents?: number | null;
  runtimeLocation?: string | null;
  dataAndKeys?: string | null;
  whatBreaksIfStopped?: string | null;
};

export type UpdateAppInput = Partial<CreateAppInput>;

export type ValidAppInput = ReturnType<typeof validateCreateAppInput>;

export type AppListQuery = {
  kind?: string | null;
  sort?: string | null;
  noticeDeadlineWithinDays?: string | null;
};

/** JSON shape of an app in the API. */
export type AppView = Omit<ValidAppInput, 'ownerId' | 'backupOwnerId'> & {
  id: string;
  owner: {id: string; name: string};
  backupOwner: {id: string; name: string};
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AppDetailView = AppView & {
  alerts: NoticeAlertView[];
  dependencies: DependencyView[];
  hosting: HostingView[];
};

const owner = alias(people, 'owner');
const backupOwner = alias(people, 'backup_owner');

export async function createApp(
  db: AppDatabase,
  workspaceId: string,
  input: CreateAppInput,
  today = todayIso(),
): Promise<AppDetailView> {
  const values = validateCreateAppInput(input);
  await assertActivePeople(db, workspaceId, [values.ownerId, values.backupOwnerId]);
  const id = newId();

  await withNameCheck(() =>
    db.transaction(async (tx) => {
      await tx.insert(apps).values({id, workspaceId, ...values});
      if (values.noticeDeadline) {
        await scheduleAlerts(tx, workspaceId, id, values.noticeDeadline, today);
      }
    }),
  );
  return getApp(db, workspaceId, id);
}

export async function listActiveApps(
  db: AppDatabase,
  workspaceId: string,
  query: AppListQuery = {},
  today = todayIso(),
): Promise<AppView[]> {
  const filters = [activeAppsIn(workspaceId)];

  if (query.kind) {
    if (!isAppKind(query.kind)) {
      throw new ValidationError(`Unknown app kind: ${query.kind}`);
    }
    filters.push(eq(apps.kind, query.kind));
  }

  if (query.noticeDeadlineWithinDays) {
    const days = Number(query.noticeDeadlineWithinDays);
    if (!Number.isInteger(days) || days < 0 || days > NOTICE_WINDOW_MAX_DAYS) {
      throw new ValidationError(
        `noticeDeadlineWithinDays must be a whole number of days from 0 to ${NOTICE_WINDOW_MAX_DAYS}`,
      );
    }
    filters.push(between(apps.noticeDeadline, today, addDaysIso(today, days)));
  }

  const sort = query.sort ?? APP_SORT.name;
  if (!(APP_SORTS as readonly string[]).includes(sort)) {
    throw new ValidationError(`Unknown sort: ${sort}`);
  }
  const order =
    sort === APP_SORT.noticeDeadline
      ? [sql`${apps.noticeDeadline} asc nulls last`, asc(apps.name)]
      : [asc(apps.name)];

  const rows = await selectAppViews(db)
    .where(and(...filters))
    .orderBy(...order);
  return rows.map(toAppView);
}

/** One app (archived ones too, as history) with its alerts, dependencies and hosting. 404 outside the workspace. */
export async function getApp(
  db: AppDatabase,
  workspaceId: string,
  id: string,
): Promise<AppDetailView> {
  const [row] = isUuid(id)
    ? await selectAppViews(db).where(and(eq(apps.workspaceId, workspaceId), eq(apps.id, id)))
    : [];
  if (!row) {
    throw new NotFoundError('App not found');
  }
  return {
    ...toAppView(row),
    alerts: await listAlertsForApp(db, workspaceId, id),
    dependencies: await listDependencies(db, workspaceId, id),
    hosting: await listHosting(db, workspaceId, id),
  };
}

/**
 * Updates an active app. Newly assigned owners must be active people.
 * If the notice deadline changes, its `scheduled` alerts
 * are replaced; `sent` and `acknowledged` alerts stay as history.
 */
export async function updateApp(
  db: AppDatabase,
  workspaceId: string,
  id: string,
  patch: UpdateAppInput,
  today = todayIso(),
): Promise<AppDetailView> {
  if (!isUuid(id)) {
    throw new NotFoundError('App not found');
  }
  await withNameCheck(() =>
    db.transaction(async (tx) => {
      // Lock the row so two edits at once cannot undo each other or orphan alerts.
      const [current] = await tx
        .select()
        .from(apps)
        .where(and(activeAppsIn(workspaceId), eq(apps.id, id)))
        .for('update');
      if (!current) {
        throw new NotFoundError('App not found');
      }
      const values = validateCreateAppInput({...current, ...patch});
      // Only newly assigned people must be active; an edit to an app whose owner has
      // left still works (reassignment belongs to the leaver flow).
      const newlyAssigned = [values.ownerId, values.backupOwnerId].filter(
        (personId) => personId !== current.ownerId && personId !== current.backupOwnerId,
      );
      if (newlyAssigned.length > 0) {
        await assertActivePeople(tx, workspaceId, newlyAssigned);
      }
      await tx.update(apps).set(values).where(eq(apps.id, id));
      if (values.noticeDeadline !== current.noticeDeadline) {
        await removeScheduledAlerts(tx, workspaceId, id);
        if (values.noticeDeadline) {
          await scheduleAlerts(tx, workspaceId, id, values.noticeDeadline, today);
        }
      }
    }),
  );
  return getApp(db, workspaceId, id);
}

/** Soft delete: hides the app, frees its name and drops alerts not yet sent. */
export async function archiveApp(
  db: AppDatabase,
  workspaceId: string,
  id: string,
): Promise<void> {
  await getApp(db, workspaceId, id);
  await db.transaction(async (tx) => {
    await tx
      .update(apps)
      .set({archivedAt: new Date()})
      .where(and(activeAppsIn(workspaceId), eq(apps.id, id)));
    await removeScheduledAlerts(tx, workspaceId, id);
  });
}

export function validateCreateAppInput(input: CreateAppInput) {
  const name = optionalText(input.name, 'name');
  if (!name) {
    throw new ValidationError('App name is required');
  }

  if (!isAppKind(input.kind)) {
    throw new ValidationError(`Unknown app kind: ${input.kind}`);
  }
  const kind = input.kind;

  const ownerId = optionalText(input.ownerId, 'owner');
  const backupOwnerId = optionalText(input.backupOwnerId, 'backup owner');
  if (!ownerId || !backupOwnerId) {
    throw new ValidationError('Owner and backup owner are required');
  }
  if (!isUuid(ownerId) || !isUuid(backupOwnerId)) {
    throw new ValidationError('Owner and backup owner must be person ids');
  }
  if (ownerId === backupOwnerId) {
    throw new ValidationError('Owner and backup owner must be different people');
  }

  const renewalDate = optionalDate(input.renewalDate, 'renewal date');
  const noticeDeadline = optionalDate(input.noticeDeadline, 'notice deadline');
  if (renewalDate && noticeDeadline && noticeDeadline > renewalDate) {
    throw new ValidationError('Notice deadline must be on or before the renewal date');
  }

  const runtimeLocation = optionalText(input.runtimeLocation, 'runtime location');
  const dataAndKeys = optionalText(input.dataAndKeys, 'data and keys');
  const whatBreaksIfStopped = optionalText(input.whatBreaksIfStopped, 'what breaks if stopped');
  if (IN_HOUSE_KINDS.includes(kind)) {
    if (!runtimeLocation || !dataAndKeys || !whatBreaksIfStopped) {
      throw new ValidationError(
        'In-house apps require where it runs, data and keys touched, and what breaks if it stops',
      );
    }
  }

  return {
    name,
    kind,
    category: optionalText(input.category, 'category'),
    vendor: optionalText(input.vendor, 'vendor'),
    description: optionalText(input.description, 'description'),
    ownerId,
    backupOwnerId,
    renewalDate,
    noticeDeadline,
    billingCycle: optionalText(input.billingCycle, 'billing cycle'),
    costCents: optionalCents(input.costCents),
    runtimeLocation,
    dataAndKeys,
    whatBreaksIfStopped,
  };
}

function selectAppViews(db: AppDatabase) {
  return db
    .select({
      app: apps,
      owner: {id: owner.id, name: owner.name},
      backupOwner: {id: backupOwner.id, name: backupOwner.name},
    })
    .from(apps)
    .innerJoin(owner, eq(owner.id, apps.ownerId))
    .innerJoin(backupOwner, eq(backupOwner.id, apps.backupOwnerId))
    .$dynamic();
}

function toAppView(row: {
  app: typeof apps.$inferSelect;
  owner: {id: string; name: string};
  backupOwner: {id: string; name: string};
}): AppView {
  const {app} = row;
  return {
    id: app.id,
    name: app.name,
    kind: app.kind as AppKind,
    category: app.category,
    vendor: app.vendor,
    description: app.description,
    owner: row.owner,
    backupOwner: row.backupOwner,
    renewalDate: app.renewalDate,
    noticeDeadline: app.noticeDeadline,
    billingCycle: app.billingCycle,
    costCents: app.costCents,
    runtimeLocation: app.runtimeLocation,
    dataAndKeys: app.dataAndKeys,
    whatBreaksIfStopped: app.whatBreaksIfStopped,
    archivedAt: app.archivedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

/** Active app names are unique per workspace (case-insensitive). */
async function withNameCheck(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError('An active app with this name already exists');
    }
    throw error;
  }
}

function isAppKind(value: unknown): value is AppKind {
  return (APP_KINDS as readonly unknown[]).includes(value);
}

function optionalCents(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_COST_CENTS) {
    throw new ValidationError('Cost must be a whole, non-negative number of cents');
  }
  return value;
}
