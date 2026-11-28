import {sql, type SQL} from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
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
  ADVISORY_SEVERITIES,
  ADVISORY_SOURCES,
  API_KEY_SCOPES,
  APP_CRITICALITIES,
  APP_ENVIRONMENTS,
  APP_KINDS,
  DEPENDENCY_CHECK_ERRORS,
  DEPENDENCY_SOURCE,
  DEPENDENCY_SOURCES,
  END_OF_SUPPORT_SOURCE,
  HOSTING_CHECK_ERROR_MAX_LENGTH,
  END_OF_SUPPORT_SOURCES,
  INCIDENT_IMPACTS,
  INCIDENT_SCOPES,
  AUDIT_ACTIONS,
  AUDIT_SUBJECTS,
  MATCH_CONFIDENCES,
  MATCH_STATUS,
  MATCH_STATUSES,
  NOTICE_CATEGORIES,
  NOTICE_ORIGINS,
  NOTICE_SEVERITIES,
  NOTICE_SOURCES,
  NOTICE_ALERT_STATUS,
  NOTICE_ALERT_STATUSES,
  OWNERSHIP_CHANGE_REASONS,
  OWNERSHIP_ROLES,
  PERSON_STATUS,
  PERSON_STATUSES,
  RESOURCE_KIND,
  RESOURCE_KINDS,
  type AdvisorySeverity,
  type AdvisorySource,
  type ApiKeyScope,
  type EndOfSupportSource,
  type IncidentImpact,
  type IncidentScope,
  type ResourceKind,
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
    /** Optional since spec v1.0 (decision D6): a missing backup owner is a setup item, not an error. */
    backupOwnerId: uuid('backup_owner_id'),
    renewalDate: date('renewal_date', {mode: 'string'}),
    noticeDeadline: date('notice_deadline', {mode: 'string'}),
    billingCycle: text('billing_cycle'),
    costCents: integer('cost_cents'),
    runtimeLocation: text('runtime_location'),
    dataAndKeys: text('data_and_keys'),
    whatBreaksIfStopped: text('what_breaks_if_stopped'),
    /** low … critical; null until someone sets it. */
    criticality: text('criticality'),
    /** Where the code lives (https only). */
    repositoryUrl: text('repository_url'),
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
    check('apps_criticality_allowed', oneOf(t.criticality, APP_CRITICALITIES)),
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

/** The environments an app runs in: one row per environment (no array column). */
export const appEnvironments = pgTable(
  'app_environments',
  {
    workspaceId: workspaceId(),
    appId: uuid('app_id').notNull(),
    environment: text('environment').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({name: 'app_environments_pk', columns: [t.appId, t.environment]}),
    foreignKey({
      name: 'app_environments_app_fk',
      columns: [t.appId, t.workspaceId],
      foreignColumns: [apps.id, apps.workspaceId],
    }).onDelete('cascade'),
    check('app_environments_environment_allowed', oneOf(t.environment, APP_ENVIRONMENTS)),
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

/** What an app runs on or pulls in: a library or SDK, added by hand or imported from a package file. */
export const appDependencies = pgTable(
  'app_dependencies',
  {
    id: id(),
    workspaceId: workspaceId(),
    appId: uuid('app_id').notNull(),
    name: text('name').notNull(),
    currentVersion: text('current_version').notNull(),
    latestVersion: text('latest_version'),
    recommendedAction: text('recommended_action'),
    /** `import` rows came from a package file and are removed when a later import no longer lists them. */
    source: text('source').notNull().default(DEPENDENCY_SOURCE.manual),
    isDev: boolean('is_dev').notNull().default(false),
    /** When monitoring last checked this row; null until the first check. */
    checkedAt: timestamp('checked_at', {withTimezone: true}),
    checkError: text('check_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('app_dependencies_id_workspace_unique').on(t.id, t.workspaceId),
    foreignKey({
      name: 'app_dependencies_app_fk',
      columns: [t.appId, t.workspaceId],
      foreignColumns: [apps.id, apps.workspaceId],
    }).onDelete('cascade'),
    // Also serves "an app's dependencies".
    uniqueIndex('app_dependencies_app_name_unique').on(t.appId, sql`lower(${t.name})`),
    check('app_dependencies_source_allowed', oneOf(t.source, DEPENDENCY_SOURCES)),
    check('app_dependencies_check_error_allowed', oneOf(t.checkError, DEPENDENCY_CHECK_ERRORS)),
  ],
);

/**
 * One advisory known for a dependency's tracked version: an id a person recorded
 * by hand (`manual`, severity unknown) or one the OSV check found (`osv`).
 * `position` keeps the order the ids were given in.
 */
export const dependencyAdvisories = pgTable(
  'dependency_advisories',
  {
    id: id(),
    workspaceId: workspaceId(),
    dependencyId: uuid('dependency_id').notNull(),
    /** The advisory's own id, such as CVE-2026-1234 or GHSA-xxxx-xxxx-xxxx. */
    advisoryId: text('advisory_id').notNull(),
    source: text('source').$type<AdvisorySource>().notNull(),
    severity: text('severity').$type<AdvisorySeverity>().notNull(),
    summary: text('summary').notNull().default(''),
    position: integer('position').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('dependency_advisories_id_workspace_unique').on(t.id, t.workspaceId),
    foreignKey({
      name: 'dependency_advisories_dependency_fk',
      columns: [t.dependencyId, t.workspaceId],
      foreignColumns: [appDependencies.id, appDependencies.workspaceId],
    }).onDelete('cascade'),
    // Also serves "a dependency's advisories".
    unique('dependency_advisories_dependency_advisory_source_unique').on(t.dependencyId, t.advisoryId, t.source),
    check('dependency_advisories_source_allowed', oneOf(t.source, ADVISORY_SOURCES)),
    check('dependency_advisories_severity_allowed', oneOf(t.severity, ADVISORY_SEVERITIES)),
  ],
);

/** Another id for the same advisory (e.g. the CVE for a GHSA), so an id recorded by hand is counted once. */
export const dependencyAdvisoryAliases = pgTable(
  'dependency_advisory_aliases',
  {
    workspaceId: workspaceId(),
    advisoryRowId: uuid('advisory_row_id').notNull(),
    alias: text('alias').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    // Also serves "an advisory's aliases".
    primaryKey({name: 'dependency_advisory_aliases_pk', columns: [t.advisoryRowId, t.alias]}),
    foreignKey({
      name: 'dependency_advisory_aliases_advisory_fk',
      columns: [t.advisoryRowId, t.workspaceId],
      foreignColumns: [dependencyAdvisories.id, dependencyAdvisories.workspaceId],
    }).onDelete('cascade'),
  ],
);

/**
 * Where an app runs: one row per provider service, e.g. Azure SQL Server in uksouth.
 * The columns from `endOfSupportSource` down are written by the hosting check
 * (`services/hosting-monitor.ts`); the incidents it finds are rows in `hosting_incidents`.
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
    /** The version matched more than one release, so the date is the earliest among them. Only ever true for a looked-up date. */
    isVersionInexact: boolean('is_version_inexact').notNull().default(false),
    healthCheckedAt: timestamp('health_checked_at', {withTimezone: true}),
    /** Which sources could not be read on the last check; null when all answered. */
    healthError: text('health_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('app_hosting_id_workspace_unique').on(t.id, t.workspaceId),
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
    check(
      'app_hosting_version_inexact_only_looked_up',
      sql`not ${t.isVersionInexact} or coalesce(${t.endOfSupportSource}, '') = ${sql.raw(`'${END_OF_SUPPORT_SOURCE.endOfLifeDate}'`)}`,
    ),
  ],
);

/**
 * One provider incident or maintenance notice that reaches a hosting row, as the
 * last hosting check found it. `position` keeps the order the check put them in
 * (heaviest first). A check replaces all of a row's incidents at once.
 */
export const hostingIncidents = pgTable(
  'hosting_incidents',
  {
    id: id(),
    workspaceId: workspaceId(),
    hostingId: uuid('hosting_id').notNull(),
    title: text('title').notNull(),
    impact: text('impact').$type<IncidentImpact>().notNull(),
    scope: text('scope').$type<IncidentScope>().notNull(),
    /** The provider's own status page for the incident; null when the feed gave no usable link. */
    url: text('url'),
    startedAt: timestamp('started_at', {withTimezone: true}),
    position: integer('position').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'hosting_incidents_hosting_fk',
      columns: [t.hostingId, t.workspaceId],
      foreignColumns: [appHosting.id, appHosting.workspaceId],
    }).onDelete('cascade'),
    // Also serves "a hosting row's incidents", in order.
    unique('hosting_incidents_hosting_position_unique').on(t.hostingId, t.position),
    check('hosting_incidents_title_not_blank', sql`btrim(${t.title}) <> ''`),
    check('hosting_incidents_impact_allowed', oneOf(t.impact, INCIDENT_IMPACTS)),
    check('hosting_incidents_scope_allowed', oneOf(t.scope, INCIDENT_SCOPES)),
  ],
);

/**
 * A notice: something that changed or is due (an advisory, an end-of-support date, a provider
 * incident). One row per thing, however many apps it affects; `dedupe_key` makes a repeat check
 * update the row instead of adding another. Rows are never deleted by a check: when the source
 * stops reporting it, `resolved_upstream_at` is set and the history stays (spec §8).
 */
export const notices = pgTable(
  'notices',
  {
    id: id(),
    workspaceId: workspaceId(),
    dedupeKey: text('dedupe_key').notNull(),
    category: text('category').notNull(),
    severity: text('severity').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    /** Where it came from, as a key, plus the name shown to people (e.g. "Azure status"). */
    source: text('source').notNull(),
    sourceName: text('source_name').notNull(),
    sourceUrl: text('source_url'),
    /** The source's own id: an advisory id, or null when the source gives none. */
    externalId: text('external_id'),
    origin: text('origin').notNull(),
    publishedAt: timestamp('published_at', {withTimezone: true}),
    /** For deadline and end-of-support notices: the date it is about. */
    dueOn: date('due_on', {mode: 'string'}),
    firstSeenAt: timestamp('first_seen_at', {withTimezone: true}).notNull(),
    lastSeenAt: timestamp('last_seen_at', {withTimezone: true}).notNull(),
    resolvedUpstreamAt: timestamp('resolved_upstream_at', {withTimezone: true}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('notices_id_workspace_unique').on(t.id, t.workspaceId),
    unique('notices_workspace_dedupe_unique').on(t.workspaceId, t.dedupeKey),
    check('notices_category_allowed', oneOf(t.category, NOTICE_CATEGORIES)),
    check('notices_severity_allowed', oneOf(t.severity, NOTICE_SEVERITIES)),
    check('notices_source_allowed', oneOf(t.source, NOTICE_SOURCES)),
    check('notices_origin_allowed', oneOf(t.origin, NOTICE_ORIGINS)),
    check('notices_title_not_blank', sql`btrim(${t.title}) <> ''`),
    index('notices_workspace_severity_idx').on(t.workspaceId, t.severity),
  ],
);

/**
 * Why a notice concerns an app: the component, version, service or region of that app it
 * matched on, the reason in words, and how sure the match is. `resolved_at` is set when the
 * app no longer has what was matched or the source stopped reporting it.
 */
export const appNoticeMatches = pgTable(
  'app_notice_matches',
  {
    id: id(),
    workspaceId: workspaceId(),
    noticeId: uuid('notice_id').notNull(),
    appId: uuid('app_id').notNull(),
    /** What on the app matched: a dependency name, or a hosting service such as "Azure App Service". */
    component: text('component').notNull(),
    version: text('version'),
    region: text('region'),
    matchReason: text('match_reason').notNull(),
    confidence: text('confidence').notNull(),
    firstSeenAt: timestamp('first_seen_at', {withTimezone: true}).notNull(),
    lastSeenAt: timestamp('last_seen_at', {withTimezone: true}).notNull(),
    resolvedAt: timestamp('resolved_at', {withTimezone: true}),
    /** Where it stands for this app ([26]); a check never changes these columns. */
    status: text('status').notNull().default(MATCH_STATUS.new),
    /** The reason for a snooze or the evidence for handled. */
    statusNote: text('status_note'),
    snoozedUntil: date('snoozed_until', {mode: 'string'}),
    statusChangedAt: timestamp('status_changed_at', {withTimezone: true}),
    assigneeId: uuid('assignee_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('app_notice_matches_id_workspace_unique').on(t.id, t.workspaceId),
    check('app_notice_matches_status_allowed', oneOf(t.status, MATCH_STATUSES)),
    check(
      'app_notice_matches_snooze_has_date',
      sql`(${t.status} = ${sql.raw(`'${MATCH_STATUS.snoozed}'`)}) = (${t.snoozedUntil} is not null)`,
    ),
    foreignKey({
      name: 'app_notice_matches_assignee_fk',
      columns: [t.assigneeId, t.workspaceId],
      foreignColumns: [people.id, people.workspaceId],
    }).onDelete('restrict'),
    unique('app_notice_matches_notice_app_component_unique').on(t.noticeId, t.appId, t.component),
    foreignKey({
      name: 'app_notice_matches_notice_fk',
      columns: [t.noticeId, t.workspaceId],
      foreignColumns: [notices.id, notices.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'app_notice_matches_app_fk',
      columns: [t.appId, t.workspaceId],
      foreignColumns: [apps.id, apps.workspaceId],
    }).onDelete('cascade'),
    check('app_notice_matches_confidence_allowed', oneOf(t.confidence, MATCH_CONFIDENCES)),
    index('app_notice_matches_app_idx').on(t.appId),
  ],
);

/**
 * Append-only history of what people and jobs did (spec §3 P0): who, what, when, before,
 * after and the note. Hand-written triggers in drizzle/0009 refuse UPDATE, TRUNCATE and direct DELETE. No foreign keys
 * to the subjects, so history outlives what it describes; `app_id` and `notice_id` let a
 * page list an app's or a notice's activity.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    workspaceId: workspaceId(),
    /** Assigned by the database at insert: the order things happened in, with no clock ties (history, undo, paging). */
    seq: bigint('seq', {mode: 'number'}).generatedAlwaysAsIdentity(),
    occurredAt: timestamp('occurred_at', {withTimezone: true}).notNull(),
    actor: text('actor').notNull(),
    /** The API key that acted (names are not unique); null for System. */
    actorKeyId: uuid('actor_key_id'),
    action: text('action').notNull(),
    subjectKind: text('subject_kind').notNull(),
    subjectId: uuid('subject_id').notNull(),
    appId: uuid('app_id'),
    noticeId: uuid('notice_id'),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    /** The snooze date the change set, so an undo can bring a snooze back. */
    snoozedUntil: date('snoozed_until', {mode: 'string'}),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    check('audit_events_action_allowed', oneOf(t.action, AUDIT_ACTIONS)),
    check('audit_events_subject_kind_allowed', oneOf(t.subjectKind, AUDIT_SUBJECTS)),
    unique('audit_events_seq_unique').on(t.seq),
    index('audit_events_workspace_seq_idx').on(t.workspaceId, t.seq),
    index('audit_events_subject_idx').on(t.subjectId, t.seq),
    index('audit_events_app_idx').on(t.appId, t.seq),
  ],
);

/**
 * [31] What each outside source did on its last check, per workspace: when it was
 * last asked, when it last answered, and the last error. A source that has never
 * been asked has no row. Findings from a source whose last attempt failed are
 * stale: the last good reading is kept and labelled, never shown as healthy.
 */
export const sourceChecks = pgTable(
  'source_checks',
  {
    workspaceId: workspaceId(),
    /** A monitoring source id: npm_registry, osv, endoflife_date, or status_<kind>_<feed>. */
    sourceId: text('source_id').notNull(),
    lastAttemptAt: timestamp('last_attempt_at', {withTimezone: true}).notNull(),
    lastSuccessAt: timestamp('last_success_at', {withTimezone: true}),
    /** Why the last attempt failed; null when it answered. */
    lastError: text('last_error'),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({name: 'source_checks_pk', columns: [t.workspaceId, t.sourceId]}),
    check('source_checks_error_length', sql`char_length(${t.lastError}) <= ${sql.raw(String(HOSTING_CHECK_ERROR_MAX_LENGTH))}`),
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
    /** Null = no expiry. Existing keys keep null (full access, never expire). */
    expiresAt: timestamp('expires_at', {withTimezone: true}),
    lastUsedAt: timestamp('last_used_at', {withTimezone: true}),
    revokedAt: timestamp('revoked_at', {withTimezone: true}),
    createdAt: createdAt(),
  },
  // Listing and revoking a workspace's keys.
  (t) => [
    index('api_keys_workspace_idx').on(t.workspaceId),
    unique('api_keys_id_workspace_unique').on(t.id, t.workspaceId),
  ],
);

/**
 * One permission a scoped API key holds. Keys with no rows here are unrestricted
 * (CLI-created keys and the UI server's APP_REGISTER_API_KEY). Settings-created
 * keys get the applications-register scopes as rows.
 */
export const apiKeyScopes = pgTable(
  'api_key_scopes',
  {
    apiKeyId: uuid('api_key_id').notNull(),
    workspaceId: workspaceId(),
    scope: text('scope').notNull().$type<ApiKeyScope>(),
  },
  (t) => [
    primaryKey({name: 'api_key_scopes_pk', columns: [t.apiKeyId, t.scope]}),
    foreignKey({
      name: 'api_key_scopes_key_fk',
      columns: [t.apiKeyId, t.workspaceId],
      foreignColumns: [apiKeys.id, apiKeys.workspaceId],
    }).onDelete('cascade'),
    check('api_key_scopes_scope_allowed', oneOf(t.scope, API_KEY_SCOPES)),
  ],
);

/**
 * What the first request with each Idempotency-Key answered about, so a repeat
 * is answered by reading that row again. No response body is stored.
 * `resource_id` has no foreign key: it points at one of several tables, and the
 * row may be deleted later (a repeat then answers 404).
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    workspaceId: workspaceId(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code').notNull(),
    /** Kind and id are null only while the write is still running, inside its own transaction. */
    resourceKind: text('resource_kind').$type<ResourceKind>(),
    resourceId: uuid('resource_id'),
    /** What a dependency import did; null for every other kind. */
    countAdded: integer('count_added'),
    countUpdated: integer('count_updated'),
    countUnchanged: integer('count_unchanged'),
    countRemoved: integer('count_removed'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({name: 'idempotency_keys_pk', columns: [t.workspaceId, t.key]}),
    check('idempotency_keys_resource_kind_allowed', oneOf(t.resourceKind, RESOURCE_KINDS)),
    check('idempotency_keys_resource_kind_with_id', sql`(${t.resourceKind} is null) = (${t.resourceId} is null)`),
    check(
      'idempotency_keys_counts_only_for_import',
      sql`num_nonnulls(${t.countAdded}, ${t.countUpdated}, ${t.countUnchanged}, ${t.countRemoved}) = case when ${t.resourceKind} = ${sql.raw(`'${RESOURCE_KIND.dependencyImport}'`)} then 4 else 0 end`,
    ),
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
export type NoticeRow = typeof notices.$inferSelect;
export type AppNoticeMatchRow = typeof appNoticeMatches.$inferSelect;
