import {readFileSync} from 'node:fs';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {
  DEFAULT_WORKSPACE_SLUG,
  NOTICE_ALERT_STATUS,
  OWNERSHIP_CHANGE_REASON,
  OWNERSHIP_ROLE,
  PERSON_STATUS,
} from '@/lib/constants';
import {MIGRATIONS_FOLDER} from './client';
import {newId} from './ids';
import {
  appDependencies,
  apps,
  attachments,
  noticeAlerts,
  ownershipChanges,
  people,
  reviewCycles,
  reviewItems,
  workspaces,
} from './schema';
import {createTestDb, type TestDb} from './test-db';
import {ensureDefaultWorkspace} from '@/lib/services/workspaces';

const ALL_TABLES = [
  'api_keys',
  'app_dependencies',
  'app_hosting',
  'apps',
  'attachments',
  'idempotency_keys',
  'notice_alerts',
  'ownership_changes',
  'people',
  'review_cycles',
  'review_items',
  'workspaces',
];

const TABLES_0001 = ['api_keys', 'app_dependencies', 'app_hosting', 'idempotency_keys'];

const COLUMNS_0002 = ['advisories', 'check_error', 'checked_at', 'is_dev', 'source'];

/** One valid row per table in a workspace, so each case breaks exactly one rule. */
async function seedWorkspace(t: TestDb, workspaceId: string) {
  const ownerId = newId();
  const backupId = newId();
  const appId = newId();
  const cycleId = newId();
  const suffix = workspaceId.slice(0, 8);
  await t.db.insert(people).values([
    {id: ownerId, workspaceId, name: 'Ada Owner', email: `ada.${suffix}@example.test`},
    {id: backupId, workspaceId, name: 'Ben Backup', email: `ben.${suffix}@example.test`},
  ]);
  await t.db.insert(apps).values({
    id: appId,
    workspaceId,
    name: 'Northwind Mail',
    kind: 'saas',
    ownerId,
    backupOwnerId: backupId,
  });
  await t.db.insert(reviewCycles).values({
    id: cycleId,
    workspaceId,
    quarter: '2026-Q4',
    startedOn: '2026-10-01',
  });
  return {workspaceId, ownerId, backupId, appId, cycleId};
}

describe('database schema', () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
  });

  it('migrating twice is a no-op and leaves the full schema with one default workspace', async () => {
    await migrate(drizzle(t.client), {migrationsFolder: MIGRATIONS_FOLDER});
    await ensureDefaultWorkspace(t.db);

    const tables = await t.client.query<{table_name: string}>(
      `select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual(ALL_TABLES);

    const journal = JSON.parse(
      readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
    ) as {entries: unknown[]};
    const applied = await t.client.query(`select id from drizzle.__drizzle_migrations`);
    expect(applied.rows).toHaveLength(journal.entries.length);

    const defaults = await t.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG));
    expect(defaults).toHaveLength(1);
  });

  it('the database itself rejects every row that breaks a listed constraint', async () => {
    const w = await seedWorkspace(t, t.workspaceId);
    const person = {workspaceId: w.workspaceId, name: 'Cy Person'};
    const app = {workspaceId: w.workspaceId, kind: 'saas', ownerId: w.ownerId, backupOwnerId: w.backupId};
    const alert = {
      workspaceId: w.workspaceId,
      appId: w.appId,
      noticeDeadline: '2026-12-31',
      offsetDays: 30,
      dueOn: '2026-12-01',
    };
    const change = {
      workspaceId: w.workspaceId,
      appId: w.appId,
      role: OWNERSHIP_ROLE.owner,
      toPersonId: w.ownerId,
      reason: OWNERSHIP_CHANGE_REASON.manual,
    };
    const attachment = {
      workspaceId: w.workspaceId,
      appId: w.appId,
      fileName: 'contract.pdf',
      contentType: 'application/pdf',
      sizeBytes: 48213,
    };
    await t.db.insert(noticeAlerts).values({id: newId(), ...alert});
    await t.db.insert(attachments).values({id: newId(), ...attachment, storageKey: 'k-1'});
    await t.db.insert(reviewItems).values({id: newId(), workspaceId: w.workspaceId, cycleId: w.cycleId, appId: w.appId});
    const changeId = newId();
    await t.db.insert(ownershipChanges).values({id: changeId, ...change, fromPersonId: w.backupId});

    const cases: [string, () => Promise<unknown>][] = [
      ['workspaces_slug_unique', () => t.db.insert(workspaces).values({id: newId(), name: 'Copy', slug: DEFAULT_WORKSPACE_SLUG})],
      ['people_email_lowercase', () => t.db.insert(people).values({id: newId(), ...person, email: 'Cy@Example.test'})],
      ['people_workspace_email_unique', () => t.db.insert(people).values({id: newId(), ...person, email: `ada.${w.workspaceId.slice(0, 8)}@example.test`})],
      ['people_status_allowed', () => t.db.insert(people).values({id: newId(), ...person, email: 'cy1@example.test', status: 'retired'})],
      ['people_left_on_matches_status', () => t.db.insert(people).values({id: newId(), ...person, email: 'cy2@example.test', status: PERSON_STATUS.left})],
      ['people_left_on_matches_status', () => t.db.insert(people).values({id: newId(), ...person, email: 'cy3@example.test', leftOn: '2026-09-30'})],
      ['null value in column "name"', () => t.client.query(`insert into people (id, workspace_id, email) values ($1, $2, 'cy4@example.test')`, [newId(), w.workspaceId])],
      ['apps_kind_allowed', () => t.db.insert(apps).values({id: newId(), ...app, name: 'Sheet', kind: 'spreadsheet'})],
      ['apps_owner_not_backup', () => t.db.insert(apps).values({id: newId(), ...app, name: 'Solo', backupOwnerId: w.ownerId})],
      ['apps_notice_before_renewal', () => t.db.insert(apps).values({id: newId(), ...app, name: 'Late', renewalDate: '2026-06-01', noticeDeadline: '2026-07-01'})],
      ['apps_cost_not_negative', () => t.db.insert(apps).values({id: newId(), ...app, name: 'Refund', costCents: -1})],
      ['apps_workspace_name_active_unique', () => t.db.insert(apps).values({id: newId(), ...app, name: 'NORTHWIND MAIL'})],
      ['apps_owner_fk', () => t.db.delete(people).where(eq(people.id, w.ownerId))],
      ['notice_alerts_offset_positive', () => t.db.insert(noticeAlerts).values({id: newId(), ...alert, offsetDays: 0})],
      ['notice_alerts_app_deadline_offset_unique', () => t.db.insert(noticeAlerts).values({id: newId(), ...alert})],
      ['notice_alerts_status_allowed', () => t.db.insert(noticeAlerts).values({id: newId(), ...alert, offsetDays: 60, status: 'snoozed'})],
      ['notice_alerts_sent_has_sent_at', () => t.db.insert(noticeAlerts).values({id: newId(), ...alert, offsetDays: 60, status: NOTICE_ALERT_STATUS.sent})],
      ['notice_alerts_acknowledged_has_acknowledged_at', () => t.db.insert(noticeAlerts).values({id: newId(), ...alert, offsetDays: 60, status: NOTICE_ALERT_STATUS.acknowledged})],
      ['attachments_size_not_negative', () => t.db.insert(attachments).values({id: newId(), ...attachment, sizeBytes: -1, storageKey: 'k-2'})],
      ['attachments_storage_key_unique', () => t.db.insert(attachments).values({id: newId(), ...attachment, storageKey: 'k-1'})],
      ['ownership_changes_from_differs_from_to', () => t.db.insert(ownershipChanges).values({id: newId(), ...change, fromPersonId: w.ownerId})],
      ['ownership_changes_role_allowed', () => t.db.insert(ownershipChanges).values({id: newId(), ...change, role: 'admin'})],
      ['ownership_changes_reason_allowed', () => t.db.insert(ownershipChanges).values({id: newId(), ...change, reason: 'whim'})],
      ['ownership_changes_append_only', () => t.db.update(ownershipChanges).set({reason: OWNERSHIP_CHANGE_REASON.leaver}).where(eq(ownershipChanges.id, changeId))],
      ['review_cycles_workspace_quarter_unique', () => t.db.insert(reviewCycles).values({id: newId(), workspaceId: w.workspaceId, quarter: '2026-Q4', startedOn: '2026-10-02'})],
      ['review_cycles_closed_after_started', () => t.db.insert(reviewCycles).values({id: newId(), workspaceId: w.workspaceId, quarter: '2027-Q1', startedOn: '2027-01-05', closedOn: '2027-01-04'})],
      ['review_items_cycle_app_unique', () => t.db.insert(reviewItems).values({id: newId(), workspaceId: w.workspaceId, cycleId: w.cycleId, appId: w.appId})],
    ];

    for (const [rule, write] of cases) {
      await expect(write(), rule).rejects.toThrow(rule);
    }

    // Children cascade: deleting an app removes its alerts; deleting a workspace removes everything.
    await t.db.delete(apps).where(eq(apps.id, w.appId));
    expect(await t.db.select().from(noticeAlerts)).toHaveLength(0);
    expect(await t.db.select().from(ownershipChanges)).toHaveLength(0);
    await t.db.delete(workspaces).where(eq(workspaces.id, w.workspaceId));
    expect(await t.db.select().from(people)).toHaveLength(0);
  });

  it('a row in one workspace cannot reference a person or app in another workspace', async () => {
    const a = await seedWorkspace(t, t.workspaceId);
    const otherId = newId();
    await t.db.insert(workspaces).values({id: otherId, name: 'Fabrikam', slug: 'fabrikam'});
    const b = await seedWorkspace(t, otherId);

    const cases: [string, () => Promise<unknown>][] = [
      ['apps_owner_fk', () => t.db.insert(apps).values({id: newId(), workspaceId: a.workspaceId, name: 'Cross', kind: 'saas', ownerId: b.ownerId, backupOwnerId: a.backupId})],
      ['apps_backup_owner_fk', () => t.db.insert(apps).values({id: newId(), workspaceId: a.workspaceId, name: 'Cross', kind: 'saas', ownerId: a.ownerId, backupOwnerId: b.backupId})],
      ['notice_alerts_app_fk', () => t.db.insert(noticeAlerts).values({id: newId(), workspaceId: a.workspaceId, appId: b.appId, noticeDeadline: '2026-12-31', offsetDays: 30, dueOn: '2026-12-01'})],
      ['notice_alerts_acknowledged_by_fk', () => t.db.insert(noticeAlerts).values({id: newId(), workspaceId: a.workspaceId, appId: a.appId, noticeDeadline: '2026-12-31', offsetDays: 30, dueOn: '2026-12-01', status: NOTICE_ALERT_STATUS.acknowledged, acknowledgedAt: new Date(), acknowledgedById: b.ownerId})],
      ['attachments_app_fk', () => t.db.insert(attachments).values({id: newId(), workspaceId: a.workspaceId, appId: b.appId, fileName: 'msa.pdf', contentType: 'application/pdf', sizeBytes: 1, storageKey: 'x-1'})],
      ['ownership_changes_to_person_fk', () => t.db.insert(ownershipChanges).values({id: newId(), workspaceId: a.workspaceId, appId: a.appId, role: OWNERSHIP_ROLE.owner, toPersonId: b.ownerId, reason: OWNERSHIP_CHANGE_REASON.leaver})],
      ['ownership_changes_from_person_fk', () => t.db.insert(ownershipChanges).values({id: newId(), workspaceId: a.workspaceId, appId: a.appId, role: OWNERSHIP_ROLE.owner, fromPersonId: b.ownerId, toPersonId: a.ownerId, reason: OWNERSHIP_CHANGE_REASON.leaver})],
      ['review_items_app_fk', () => t.db.insert(reviewItems).values({id: newId(), workspaceId: a.workspaceId, cycleId: a.cycleId, appId: b.appId})],
      ['review_items_cycle_fk', () => t.db.insert(reviewItems).values({id: newId(), workspaceId: a.workspaceId, cycleId: b.cycleId, appId: a.appId})],
    ];

    for (const [fk, write] of cases) {
      await expect(write(), fk).rejects.toThrow(fk);
    }
  });

  it('rolling back migration 0001 removes only its tables, and migrating again restores them', async () => {
    // Rollbacks run newest first: 0002 changed a table that 0001 created.
    for (const file of ['0002_dependency_health.down.sql', '0001_api_keys_idempotency_deps_hosting.down.sql']) {
      await t.client.exec(readFileSync(path.join(MIGRATIONS_FOLDER, 'rollback', file), 'utf8'));
    }
    const after = await t.client.query<{table_name: string}>(
      `select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(after.rows.map((r) => r.table_name)).toEqual(ALL_TABLES.filter((n) => !TABLES_0001.includes(n)));

    await migrate(drizzle(t.client), {migrationsFolder: MIGRATIONS_FOLDER});
    const restored = await t.client.query<{table_name: string}>(
      `select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(restored.rows.map((r) => r.table_name)).toEqual(ALL_TABLES);
  });

  it('rolling back migration 0002 removes only the dependency monitoring columns and keeps the dependencies, and migrating again restores them', async () => {
    const w = await seedWorkspace(t, t.workspaceId);
    await t.db.insert(appDependencies).values({id: newId(), workspaceId: w.workspaceId, appId: w.appId, name: 'left-pad', currentVersion: '1.3.0'});
    const columns = async () =>
      (
        await t.client.query<{column_name: string}>(
          `select column_name from information_schema.columns where table_name = 'app_dependencies' order by 1`,
        )
      ).rows.map((r) => r.column_name);
    const before = await columns();

    const down = readFileSync(path.join(MIGRATIONS_FOLDER, 'rollback', '0002_dependency_health.down.sql'), 'utf8');
    await t.client.exec(down);
    expect(await columns()).toEqual(before.filter((name) => !COLUMNS_0002.includes(name)));
    const kept = await t.client.query<{name: string}>(`select name from app_dependencies`);
    expect(kept.rows).toEqual([{name: 'left-pad'}]);

    await migrate(drizzle(t.client), {migrationsFolder: MIGRATIONS_FOLDER});
    expect(await columns()).toEqual(before);
  });

  it('unit tests run on in-process PGlite with the real migrations, no Docker needed', async () => {
    expect(t.client).toBeInstanceOf(PGlite);
    const result = await t.client.query<{version: string}>('select version()');
    expect(result.rows[0].version).toMatch(/wasm/);
  });
});
