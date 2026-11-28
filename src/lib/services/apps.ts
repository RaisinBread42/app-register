import {and, asc, between, eq, inArray, sql} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {
  APP_CRITICALITIES,
  APP_ENVIRONMENTS,
  APP_KINDS,
  APP_SORT,
  APP_SORTS,
  NOTICE_WINDOW_MAX_DAYS,
  REPOSITORY_URL_MAX_LENGTH,
  type AppCriticality,
  type AppEnvironment,
  type AppKind,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {appDependencies, appEnvironments, appHosting, apps, people} from '@/lib/db/schema';
import {addDaysIso, todayIso} from '@/lib/notice-alerts';
import {activeAppsIn} from './app-scope';
import {listDependencies, type DependencyView} from './dependencies';
import {loadDependencies, type DependencyRecord} from './dependency-advisories';
import {isUniqueViolation, NotFoundError, ValidationError} from './errors';
import {appHealth, type AppHealth, type HealthFacts} from './health';
import {listHosting, type HostingView} from './hosting';
import {loadHosting, type HostingRecord} from './hosting-incidents';
import {
  listAlertsForApp,
  removeScheduledAlerts,
  scheduleAlerts,
  type NoticeAlertView,
} from './notice-alerts';
import {assertActivePeople} from './people';
import {optionalDate, optionalText} from './validation';

/** Largest value the `cost_cents integer` column holds. */
const MAX_COST_CENTS = 2_147_483_647;

export type CreateAppInput = {
  name: string;
  kind: string;
  ownerId: string;
  /** Optional (decision D6); null clears it. */
  backupOwnerId?: string | null;
  criticality?: string | null;
  repositoryUrl?: string | null;
  /** The environments it runs in. On an edit, leave it out to keep them. */
  environments?: string[];
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
  backupOwner: {id: string; name: string} | null;
  environments: AppEnvironment[];
  health: AppHealth;
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
  const environments = validateEnvironments(input.environments ?? []);
  await assertActivePeople(db, workspaceId, assignedPeople(values));
  const id = newId();

  await withNameCheck(() =>
    db.transaction(async (tx) => {
      await tx.insert(apps).values({id, workspaceId, ...values});
      await replaceEnvironments(tx, workspaceId, id, environments);
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
  const appIds = rows.map((row) => row.app.id);
  const dependencies = await dependenciesByApp(db, workspaceId, appIds);
  const hosting = await hostingByApp(db, workspaceId, appIds);
  const environments = await environmentsByApp(db, workspaceId, appIds);
  return rows.map((row) =>
    toAppView(
      row,
      {dependencies: dependencies.get(row.app.id) ?? [], hosting: hosting.get(row.app.id) ?? [], today},
      environments.get(row.app.id) ?? [],
    ),
  );
}

/** The environments of several apps in one query, in the order APP_ENVIRONMENTS lists them. */
async function environmentsByApp(
  db: AppDatabase,
  workspaceId: string,
  appIds: string[],
): Promise<Map<string, AppEnvironment[]>> {
  const rows = appIds.length
    ? await db
        .select({appId: appEnvironments.appId, environment: appEnvironments.environment})
        .from(appEnvironments)
        .where(and(eq(appEnvironments.workspaceId, workspaceId), inArray(appEnvironments.appId, appIds)))
    : [];
  const byApp = new Map<string, AppEnvironment[]>();
  for (const row of rows) {
    byApp.set(row.appId, [...(byApp.get(row.appId) ?? []), row.environment as AppEnvironment]);
  }
  for (const [appId, list] of byApp) {
    byApp.set(appId, APP_ENVIRONMENTS.filter((environment) => list.includes(environment)));
  }
  return byApp;
}

/** Makes an app's environments exactly `environments`. Call it inside the app's write transaction. */
async function replaceEnvironments(
  tx: AppDatabase,
  workspaceId: string,
  appId: string,
  environments: AppEnvironment[],
): Promise<void> {
  await tx.delete(appEnvironments).where(and(eq(appEnvironments.workspaceId, workspaceId), eq(appEnvironments.appId, appId)));
  if (environments.length > 0) {
    await tx.insert(appEnvironments).values(environments.map((environment) => ({workspaceId, appId, environment})));
  }
}

/** The dependencies of several apps in one query, for their health scores. */
async function dependenciesByApp(
  db: AppDatabase,
  workspaceId: string,
  appIds: string[],
): Promise<Map<string, DependencyRecord[]>> {
  const rows = appIds.length
    ? await loadDependencies(db, and(eq(appDependencies.workspaceId, workspaceId), inArray(appDependencies.appId, appIds)))
    : [];
  const byApp = new Map<string, DependencyRecord[]>();
  for (const row of rows) {
    byApp.set(row.appId, [...(byApp.get(row.appId) ?? []), row]);
  }
  return byApp;
}

/** The hosting rows of several apps in one query, for their health scores. */
async function hostingByApp(
  db: AppDatabase,
  workspaceId: string,
  appIds: string[],
): Promise<Map<string, HostingRecord[]>> {
  const rows = appIds.length
    ? await loadHosting(db, and(eq(appHosting.workspaceId, workspaceId), inArray(appHosting.appId, appIds)))
    : [];
  const byApp = new Map<string, HostingRecord[]>();
  for (const row of rows) {
    byApp.set(row.appId, [...(byApp.get(row.appId) ?? []), row]);
  }
  return byApp;
}

/** One app (archived ones too, as history) with its alerts, dependencies and hosting. 404 outside the workspace. */
export async function getApp(
  db: AppDatabase,
  workspaceId: string,
  id: string,
  today = todayIso(),
): Promise<AppDetailView> {
  const [row] = isUuid(id)
    ? await selectAppViews(db).where(and(eq(apps.workspaceId, workspaceId), eq(apps.id, id)))
    : [];
  if (!row) {
    throw new NotFoundError('App not found');
  }
  const dependencies = await listDependencies(db, workspaceId, id);
  const hosting = await listHosting(db, workspaceId, id);
  const environments = await environmentsByApp(db, workspaceId, [id]);
  return {
    ...toAppView(row, {dependencies, hosting, today}, environments.get(id) ?? []),
    alerts: await listAlertsForApp(db, workspaceId, id),
    dependencies,
    hosting,
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
      const newlyAssigned = assignedPeople(values).filter(
        (personId) => personId !== current.ownerId && personId !== current.backupOwnerId,
      );
      if (newlyAssigned.length > 0) {
        await assertActivePeople(tx, workspaceId, newlyAssigned);
      }
      await tx.update(apps).set(values).where(eq(apps.id, id));
      if (patch.environments !== undefined) {
        await replaceEnvironments(tx, workspaceId, id, validateEnvironments(patch.environments));
      }
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
  if (!ownerId) {
    throw new ValidationError('Owner is required');
  }
  if (!isUuid(ownerId) || (backupOwnerId !== null && !isUuid(backupOwnerId))) {
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

  // Optional for every kind since spec v1.0 (Journey B, decision D6): add them now or later.
  const runtimeLocation = optionalText(input.runtimeLocation, 'runtime location');
  const dataAndKeys = optionalText(input.dataAndKeys, 'data and keys');
  const whatBreaksIfStopped = optionalText(input.whatBreaksIfStopped, 'what breaks if stopped');

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
    criticality: optionalCriticality(input.criticality),
    repositoryUrl: optionalRepositoryUrl(input.repositoryUrl),
  };
}

/** Allowed environments, each once, in the order APP_ENVIRONMENTS lists them. */
export function validateEnvironments(value: unknown): AppEnvironment[] {
  if (!Array.isArray(value) || value.some((item) => !(APP_ENVIRONMENTS as readonly unknown[]).includes(item))) {
    throw new ValidationError(`environments must be a list of: ${APP_ENVIRONMENTS.join(', ')}`);
  }
  return APP_ENVIRONMENTS.filter((environment) => value.includes(environment));
}

function optionalCriticality(value: unknown): AppCriticality | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (!(APP_CRITICALITIES as readonly unknown[]).includes(value)) {
    throw new ValidationError(`criticality must be one of: ${APP_CRITICALITIES.join(', ')}`);
  }
  return value as AppCriticality;
}

/** An https URL only: it is shown as a link, so no other scheme gets through. */
function optionalRepositoryUrl(value: unknown): string | null {
  const text = optionalText(value, 'repository URL');
  if (text === null) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ValidationError('Repository URL must be a full https:// address');
  }
  if (url.protocol !== 'https:' || text.length > REPOSITORY_URL_MAX_LENGTH) {
    throw new ValidationError(`Repository URL must be an https:// address of at most ${REPOSITORY_URL_MAX_LENGTH} characters`);
  }
  return url.href;
}

/** The people an app names: its owner, and its backup owner when it has one. */
function assignedPeople(values: {ownerId: string; backupOwnerId: string | null}): string[] {
  return values.backupOwnerId ? [values.ownerId, values.backupOwnerId] : [values.ownerId];
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
    .leftJoin(backupOwner, eq(backupOwner.id, apps.backupOwnerId))
    .$dynamic();
}

function toAppView(
  row: {
    app: typeof apps.$inferSelect;
    owner: {id: string; name: string};
    backupOwner: {id: string; name: string} | null;
  },
  facts: HealthFacts,
  environments: AppEnvironment[],
): AppView {
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
    criticality: app.criticality as AppCriticality | null,
    repositoryUrl: app.repositoryUrl,
    environments,
    health: appHealth(facts),
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
