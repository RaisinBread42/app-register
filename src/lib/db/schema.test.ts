import {readFileSync} from 'node:fs';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {
  ADVISORY_SEVERITY,
  ADVISORY_SOURCE,
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
  dependencyAdvisories,
  dependencyAdvisoryAliases,
  noticeAlerts,
  ownershipChanges,
  people,
  reviewCycles,
  reviewItems,
  workspaces,
} from './schema';
import {createTestDb, type TestDb} from './test-db';
import {listDependencies} from '@/lib/services/dependencies';
import {ensureDefaultWorkspace} from '@/lib/services/workspaces';

const ALL_TABLES = [
  'api_keys',
  'app_dependencies',
  'app_hosting',
  'apps',
  'attachments',
  'dependency_advisories',
  'dependency_advisory_aliases',
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

const TABLES_0003 = ['dependency_advisories', 'dependency_advisory_aliases'];

/** Rollback files, newest first: the order they must run in. */
const ROLLBACK_0003 = '0003_relational_advisories.down.sql';
const ROLLBACK_0002 = '0002_dependency_health.down.sql';
const ROLLBACK_0001 = '0001_api_keys_idempotency_deps_hosting.down.sql';

function rollbackSql(file: string): string {
  return readFileSync(path.join(MIGRATIONS_FOLDER, 'rollback', file), 'utf8');
}

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

  it('the database itself rejects an advisory row that breaks a listed constraint, and advisories go with their dependency', async () => {
    const w = await seedWorkspace(t, t.workspaceId);
    const dependencyId = newId();
    await t.db.insert(appDependencies).values({id: dependencyId, workspaceId: w.workspaceId, appId: w.appId, name: 'left-pad', currentVersion: '1.3.0'});
    const advisory = {
      workspaceId: w.workspaceId,
      dependencyId,
      advisoryId: 'GHSA-aaaa-1111-bbbb',
      source: ADVISORY_SOURCE.osv,
      severity: ADVISORY_SEVERITY.high,
      position: 0,
    };
    const rowId = newId();
    await t.db.insert(dependencyAdvisories).values({id: rowId, ...advisory});
    const alias = {workspaceId: w.workspaceId, advisoryRowId: rowId, alias: 'CVE-2026-4411', position: 0};
    await t.db.insert(dependencyAdvisoryAliases).values(alias);
    // The same id recorded by hand is another row: the unique key includes the source.
    await t.db.insert(dependencyAdvisories).values({id: newId(), ...advisory, source: ADVISORY_SOURCE.manual, severity: ADVISORY_SEVERITY.unknown});

    const cases: [string, () => Promise<unknown>][] = [
      ['dependency_advisories_dependency_advisory_source_unique', () => t.db.insert(dependencyAdvisories).values({id: newId(), ...advisory, position: 1})],
      ['dependency_advisories_source_allowed', () => t.client.query(`insert into dependency_advisories (id, workspace_id, dependency_id, advisory_id, source, severity, position) values ($1, $2, $3, 'GHSA-x', 'rumour', 'high', 1)`, [newId(), w.workspaceId, dependencyId])],
      ['dependency_advisories_severity_allowed', () => t.client.query(`insert into dependency_advisories (id, workspace_id, dependency_id, advisory_id, source, severity, position) values ($1, $2, $3, 'GHSA-y', 'osv', 'scary', 1)`, [newId(), w.workspaceId, dependencyId])],
      ['null value in column "advisory_id"', () => t.client.query(`insert into dependency_advisories (id, workspace_id, dependency_id, source, severity, position) values ($1, $2, $3, 'osv', 'high', 1)`, [newId(), w.workspaceId, dependencyId])],
      ['dependency_advisories_dependency_fk', () => t.db.insert(dependencyAdvisories).values({id: newId(), ...advisory, dependencyId: newId()})],
      ['dependency_advisory_aliases_pk', () => t.db.insert(dependencyAdvisoryAliases).values({...alias, position: 1})],
      ['dependency_advisory_aliases_advisory_fk', () => t.db.insert(dependencyAdvisoryAliases).values({...alias, advisoryRowId: newId()})],
    ];
    for (const [rule, write] of cases) {
      await expect(write(), rule).rejects.toThrow(rule);
    }

    await t.db.delete(appDependencies).where(eq(appDependencies.id, dependencyId));
    expect(await t.db.select().from(dependencyAdvisories)).toHaveLength(0);
    expect(await t.db.select().from(dependencyAdvisoryAliases)).toHaveLength(0);
  });

  it('an advisory cannot point at a dependency in another workspace, nor an alias at an advisory in another workspace', async () => {
    const a = await seedWorkspace(t, t.workspaceId);
    const otherId = newId();
    await t.db.insert(workspaces).values({id: otherId, name: 'Fabrikam', slug: 'fabrikam'});
    const b = await seedWorkspace(t, otherId);
    const theirDependencyId = newId();
    const theirAdvisoryRowId = newId();
    await t.db.insert(appDependencies).values({id: theirDependencyId, workspaceId: b.workspaceId, appId: b.appId, name: 'left-pad', currentVersion: '1.3.0'});
    const advisory = {dependencyId: theirDependencyId, advisoryId: 'GHSA-aaaa-1111-bbbb', source: ADVISORY_SOURCE.osv, severity: ADVISORY_SEVERITY.high, position: 0};
    await t.db.insert(dependencyAdvisories).values({id: theirAdvisoryRowId, workspaceId: b.workspaceId, ...advisory});

    await expect(
      t.db.insert(dependencyAdvisories).values({id: newId(), workspaceId: a.workspaceId, ...advisory, advisoryId: 'GHSA-cross'}),
    ).rejects.toThrow('dependency_advisories_dependency_fk');
    await expect(
      t.db.insert(dependencyAdvisoryAliases).values({workspaceId: a.workspaceId, advisoryRowId: theirAdvisoryRowId, alias: 'CVE-2026-4411', position: 0}),
    ).rejects.toThrow('dependency_advisory_aliases_advisory_fk');
  });

  it('migration 0003 moves stored advisories and hand-recorded ids into tables, and its rollback puts them back in the old columns', async () => {
    const w = await seedWorkspace(t, t.workspaceId);
    await t.client.exec(rollbackSql(ROLLBACK_0003));
    const advisories = [
      {id: 'GHSA-qqqq-1111-aaaa', aliases: ['CVE-2026-4411', 'PYSEC-2026-7'], severity: 'high', summary: 'Prototype pollution in merge()', url: 'https://osv.dev/vulnerability/GHSA-qqqq-1111-aaaa'},
      {id: 'MAL-2026-0042', aliases: [], severity: 'critical', summary: '', url: 'https://osv.dev/vulnerability/MAL-2026-0042'},
    ];
    const vulnerabilities = ['INTERNAL-77', 'cve-2026-4411'];
    // Odd stored JSON the copy must skip without failing: not objects, no text id, a repeated id.
    const odd = [{aliases: ['no id']}, null, 'text', {id: 7}, {...advisories[0], summary: 'repeat'}];
    const quillId = newId();
    const brokenId = newId();
    const insertOld = `insert into app_dependencies (id, workspace_id, app_id, name, current_version, vulnerabilities, advisories) values ($1, $2, $3, $4, '3.9.0', $5, $6)`;
    await t.client.query(insertOld, [quillId, w.workspaceId, w.appId, 'quill-forms', vulnerabilities, JSON.stringify([...advisories, ...odd])]);
    await t.client.query(insertOld, [brokenId, w.workspaceId, w.appId, 'tally-ui', [], JSON.stringify({not: 'a list'})]);

    await migrate(drizzle(t.client), {migrationsFolder: MIGRATIONS_FOLDER});
    const stored = await t.client.query<{advisory_id: string; source: string; severity: string; position: number}>(
      `select advisory_id, source, severity, position from dependency_advisories where dependency_id = $1 order by source, position`,
      [quillId],
    );
    expect(stored.rows).toEqual([
      {advisory_id: 'INTERNAL-77', source: 'manual', severity: 'unknown', position: 0},
      {advisory_id: 'cve-2026-4411', source: 'manual', severity: 'unknown', position: 1},
      {advisory_id: 'GHSA-qqqq-1111-aaaa', source: 'osv', severity: 'high', position: 0},
      {advisory_id: 'MAL-2026-0042', source: 'osv', severity: 'critical', position: 1},
    ]);
    const [quill, tally] = await listDependencies(t.db, w.workspaceId, w.appId);
    expect(quill).toMatchObject({name: 'quill-forms', vulnerabilities, advisories});
    expect(tally).toMatchObject({name: 'tally-ui', vulnerabilities: [], advisories: []});

    await t.client.exec(rollbackSql(ROLLBACK_0003));
    const old = await t.client.query<{vulnerabilities: string[]; advisories: unknown}>(
      `select vulnerabilities, advisories from app_dependencies where id = $1`,
      [quillId],
    );
    expect(old.rows).toEqual([{vulnerabilities, advisories}]);
  });

  it('rolling back migration 0001 removes only its tables, and migrating again restores them', async () => {
    // Rollbacks run newest first: 0003 and 0002 changed a table that 0001 created.
    for (const file of [ROLLBACK_0003, ROLLBACK_0002, ROLLBACK_0001]) {
      await t.client.exec(rollbackSql(file));
    }
    const after = await t.client.query<{table_name: string}>(
      `select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(after.rows.map((r) => r.table_name)).toEqual(ALL_TABLES.filter((n) => ![...TABLES_0001, ...TABLES_0003].includes(n)));

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

    await t.client.exec(rollbackSql(ROLLBACK_0003));
    const at0002 = await columns();
    await t.client.exec(rollbackSql(ROLLBACK_0002));
    expect(await columns()).toEqual(at0002.filter((name) => !COLUMNS_0002.includes(name)));
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
