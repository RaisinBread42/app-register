import {sql, type SQL} from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  APP_KINDS,
  END_OF_SUPPORT_SOURCES,
  NOTICE_ALERT_STATUS,
  NOTICE_ALERT_STATUSES,
  OWNERSHIP_CHANGE_REASONS,
  OWNERSHIP_ROLES,
  PERSON_STATUS,
  PERSON_STATUSES,
  type EndOfSupportSource,
  type IncidentImpact,
  type IncidentScope,
} from '../constants';

/** CHECK (column IN (...)) built from a constants array, so TS and DB share one list. */
function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  const list = values.map((value) => `'${value}'`).join(', ');
  return sql`${column} in (${sql.raw(list)})`;
}

const id = () => uuid('id').primaryKey();
const createdAt = () =>
  timestamp('created_at', {withTimezone: true}).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', {withTimezone: true})
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const workspaceId = () =>
  uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, {onDelete: 'cascade'});

export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique('workspaces_slug_unique'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const people = pgTable(
  'people',
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    status: text('status').notNull().default(PERSON_STATUS.active),
    leftOn: date('left_on', {mode: 'string'}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('people_id_workspace_unique').on(t.id, t.workspaceId),
    unique('people_workspace_email_unique').on(t.workspaceId, t.email),
    check('people_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('people_status_allowed', oneOf(t.status, PERSON_STATUSES)),
    check(
      'people_left_on_matches_status',
      sql`(${t.status} = ${sql.raw(`'${PERSON_STATUS.left}'`)}) = (${t.leftOn} is not null)`,
    ),
  ],
);

export const apps = pgTable(
  'apps',
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    category: text('category'),
    vendor: text('vendor'),
    description: text('description'),
    ownerId: uuid('owner_id').notNull(),
    backupOwnerId: uuid('backup_owner_id').notNull(),
    renewalDate: date('renewal_date', {mode: 'string'}),
    noticeDeadline: date('notice_deadline', {mode: 'string'}),
    billingCycle: text('billing_cycle'),
    costCents: integer('cost_cents'),
    runtimeLocation: text('runtime_location'),
    dataAndKeys: text('data_and_keys'),
    whatBreaksIfStopped: text('what_breaks_if_stopped'),
    archivedAt: timestamp('archived_at', {withTimezone: true}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('apps_id_workspace_unique').on(t.id, t.workspaceId),
    foreignKey({
      name: 'apps_owner_fk',
      columns: [t.ownerId, t.workspaceId],
      foreignColumns: [people.id, people.workspaceId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'apps_backup_owner_fk',
      columns: [t.backupOwnerId, t.workspaceId],
      foreignColumns: [people.id, people.workspaceId],
    }).onDelete('restrict'),
    check('apps_kind_allowed', oneOf(t.kind, APP_KINDS)),
    check('apps_owner_not_backup', sql`${t.ownerId} <> ${t.backupOwnerId}`),
    check(
      'apps_notice_before_renewal',
      sql`${t.noticeDeadline} <= ${t.renewalDate}`,
    ),
    check('apps_cost_not_negative', sql`${t.costCents} >= 0`),
    uniqueIndex('apps_workspace_name_active_unique')
      .on(t.workspaceId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    index('apps_workspace_notice_deadline_active_idx')
      .on(t.workspaceId, t.noticeDeadline)
      .where(sql`${t.archivedAt} is null`),
    index('apps_owner_idx').on(t.ownerId),
    index('apps_backup_owner_idx').on(t.backupOwnerId),
  ],
);

export const noticeAlerts = pgTable(
  'notice_alerts',
  {
    id: id(),
    workspaceId: workspaceId(),
    appId: uuid('app_id').notNull(),
    noticeDeadline: date('notice_deadline', {mode: 'string'}).notNull(),
    offsetDays: integer('offset_days').notNull(),
    dueOn: date('due_on', {mode: 'string'}).notNull(),
    status: text('status').notNull().default(NOTICE_ALERT_STATUS.scheduled),
    sentAt: timestamp('sent_at', {withTimezone: true}),
    acknowledgedAt: timestamp('acknowledged_at', {withTimezone: true}),
    acknowledgedById: uuid('acknowledged_by_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'notice_alerts_app_fk',
      columns: [t.appId, t.workspaceId],
      foreignColumns: [apps.id, apps.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'notice_alerts_acknowledged_by_fk',
      columns: [t.acknowledgedById, t.workspaceId],
      foreignColumns: [people.id, people.workspaceId],
    }).onDelete('restrict'),
    unique('notice_alerts_app_deadline_offset_unique').on(
      t.appId,
      t.noticeDeadline,
      t.offsetDays,
    ),
    check('notice_alerts_offset_positive', sql`${t.offsetDays} > 0`),
    check('notice_alerts_status_allowed', oneOf(t.status, NOTICE_ALERT_STATUSES)),
    check(
      'notice_alerts_sent_has_sent_at',
      sql`${t.status} <> ${sql.raw(`'${NOTICE_ALERT_STATUS.sent}'`)} or ${t.sentAt} is not null`,
    ),
    check(
      'notice_alerts_acknowledged_has_acknowledged_at',
      sql`${t.status} <> ${sql.raw(`'${NOTICE_ALERT_STATUS.acknowledged}'`)} or ${t.acknowledgedAt} is not null`,
    ),
    index('notice_alerts_workspace_status_due_idx').on(
      t.workspaceId,
      t.status,
      t.dueOn,
    ),
    index('notice_alerts_scheduled_due_idx')
      .on(t.dueOn)
      .where(sql`${t.status} = ${sql.raw(`'${NOTICE_ALERT_STATUS.scheduled}'`)}`),
    index('notice_alerts_acknowledged_by_idx').on(t.acknowledgedById),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    workspaceId: workspaceId(),
    appId: uuid('app_id').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', {mode: 'number'}).notNull(),
    storageKey: text('storage_key').notNull().unique('attachments_storage_key_unique'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'attachments_app_fk',
      columns: [t.appId, t.workspaceId],
      foreignColumns: [apps.id, apps.workspaceId],
    }).onDelete('cascade'),
    check('attachments_size_not_negative', sql`${t.sizeBytes} >= 0`),
    index('attachments_app_idx').on(t.appId),
  ],
);

/**
 * Append-only history: no updated_at, and a hand-written trigger in
 * drizzle/0000_init.sql refuses UPDATE (drizzle-kit cannot generate triggers).
 */
export const ownershipChanges = pgTable(
  'ownership_changes',
  {
    id: id(),
    workspaceId: workspaceId(),
    appId: uuid('app_id').notNull(),
    role: text('role').notNull(),
    fromPersonId: uuid('from_person_id'),
    toPersonId: uuid('to_person_id').notNull(),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'ownership_changes_app_fk',
      columns: [t.appId, t.workspaceId],
      foreignColumns: [apps.id, apps.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ownership_changes_from_person_fk',
      columns: [t.fromPersonId, t.workspaceId],
      foreignColumns: [people.id, people.workspaceId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'ownership_changes_to_person_fk',
      columns: [t.toPersonId, t.workspaceId],
      foreignColumns: [people.id, people.workspaceId],
    }).onDelete('restrict'),
    check('ownership_changes_role_allowed', oneOf(t.role, OWNERSHIP_ROLES)),
    check(
      'ownership_changes_reason_allowed',
      oneOf(t.reason, OWNERSHIP_CHANGE_REASONS),
    ),
    check(
      'ownership_changes_from_differs_from_to',
      sql`${t.fromPersonId} is distinct from ${t.toPersonId}`,
    ),
    index('ownership_changes_app_created_idx').on(t.appId, t.createdAt),
    index('ownership_changes_from_person_idx').on(t.fromPersonId),
    index('ownership_changes_to_person_idx').on(t.toPersonId),
  ],
);

export const reviewCycles = pgTable(
  'review_cycles',
  {
    id: id(),
    workspaceId: workspaceId(),
    quarter: text('quarter').notNull(),
    startedOn: date('started_on', {mode: 'string'}).notNull(),
    closedOn: date('closed_on', {mode: 'string'}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('review_cycles_id_workspace_unique').on(t.id, t.workspaceId),
    unique('review_cycles_workspace_quarter_unique').on(t.workspaceId, t.quarter),
    check(
      'review_cycles_closed_after_started',
      sql`${t.closedOn} >= ${t.startedOn}`,
    ),
  ],
);

/** still_used / still_owned stay null until the reviewer answers. */
export const reviewItems = pgTable(
  'review_items',
  {
    id: id(),
    workspaceId: workspaceId(),
    cycleId: uuid('cycle_id').notNull(),
    appId: uuid('app_id').notNull(),
    stillUsed: boolean('still_used'),
    stillOwned: boolean('still_owned'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'review_items_cycle_fk',
      columns: [t.cycleId, t.workspaceId],
      foreignColumns: [reviewCycles.id, reviewCycles.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'review_items_app_fk',
      columns: [t.appId, t.workspaceId],
      foreignColumns: [apps.id, apps.workspaceId],
    }).onDelete('cascade'),
    unique('review_items_cycle_app_unique').on(t.cycleId, t.appId),
    index('review_items_app_idx').on(t.appId),
  ],
);

/** What an app runs on or pulls in: a library, SDK or agent, recorded by hand. */
export const appDependencies = pgTable(
  'app_dependencies',
  {
    id: id(),
    workspaceId: workspaceId(),
    appId: uuid('app_id').notNull(),
    name: text('name').notNull(),
    currentVersion: text('current_version').notNull(),
    latestVersion: text('latest_version'),
    /** Advisory ids such as CVE-2026-1234; empty when none are known. */
    vulnerabilities: text('vulnerabilities').array().notNull().default(sql`'{}'::text[]`),
    recommendedAction: text('recommended_action'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'app_dependencies_app_fk',
      columns: [t.appId, t.workspaceId],
      foreignColumns: [apps.id, apps.workspaceId],
    }).onDelete('cascade'),
    // Also serves "an app's dependencies".
    uniqueIndex('app_dependencies_app_name_unique').on(t.appId, sql`lower(${t.name})`),
  ],
);

/** A provider incident or maintenance notice that reaches a hosting row, as the last check found it. */
export type HostingIncident = {
  title: string;
  impact: IncidentImpact;
  scope: IncidentScope;
  url: string;
  startedAt: string | null;
};

/**
 * Where an app runs: one row per provider service, e.g. Azure SQL Server in uksouth.
 * The last five columns are written by the hosting check (`services/hosting-monitor.ts`).
 */
export const appHosting = pgTable(
  'app_hosting',
  {
    id: id(),
    workspaceId: workspaceId(),
    appId: uuid('app_id').notNull(),
    provider: text('provider').notNull(),
    service: text('service').notNull(),
    region: text('region'),
    version: text('version'),
    /** Language runtime the service runs, e.g. Node.js 22. */
    runtime: text('runtime'),
    runtimeVersion: text('runtime_version'),
    endOfSupportOn: date('end_of_support_on', {mode: 'string'}),
    /** Who set the date: a person (`manual`, never overwritten) or a check. */
    endOfSupportSource: text('end_of_support_source').$type<EndOfSupportSource>(),
    incidents: jsonb('incidents').$type<HostingIncident[]>().notNull().default(sql`'[]'::jsonb`),
    healthCheckedAt: timestamp('health_checked_at', {withTimezone: true}),
    /** Which sources could not be read on the last check; null when all answered. */
    healthError: text('health_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'app_hosting_app_fk',
      columns: [t.appId, t.workspaceId],
      foreignColumns: [apps.id, apps.workspaceId],
    }).onDelete('cascade'),
    // Also serves "an app's hosting".
    unique('app_hosting_app_service_unique')
      .on(t.appId, t.provider, t.service, t.region)
      .nullsNotDistinct(),
    check('app_hosting_end_of_support_source_allowed', oneOf(t.endOfSupportSource, END_OF_SUPPORT_SOURCES)),
    check(
      'app_hosting_end_of_support_has_source',
      sql`(${t.endOfSupportOn} is null) = (${t.endOfSupportSource} is null)`,
    ),
  ],
);

/** Bearer API keys. Only the SHA-256 hash is stored; the key is shown once at creation. */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique('api_keys_key_hash_unique'),
    /** First characters of the key, so a person can tell keys apart. Not secret. */
    keyPrefix: text('key_prefix').notNull(),
    revokedAt: timestamp('revoked_at', {withTimezone: true}),
    createdAt: createdAt(),
  },
  // Listing and revoking a workspace's keys.
  (t) => [index('api_keys_workspace_idx').on(t.workspaceId)],
);

/** First response to each Idempotency-Key, replayed for repeats of the same request. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    workspaceId: workspaceId(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({name: 'idempotency_keys_pk', columns: [t.workspaceId, t.key]}),
    // Expiry sweep: keys older than the TTL.
    index('idempotency_keys_created_idx').on(t.createdAt),
  ],
);

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type PersonRow = typeof people.$inferSelect;
export type AppRow = typeof apps.$inferSelect;
export type NoticeAlertRow = typeof noticeAlerts.$inferSelect;
export type AppDependencyRow = typeof appDependencies.$inferSelect;
export type AppHostingRow = typeof appHosting.$inferSelect;
