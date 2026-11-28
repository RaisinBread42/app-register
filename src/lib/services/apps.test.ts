import {and, eq} from 'drizzle-orm';
import {beforeEach, describe, expect, it} from 'vitest';
import {APP_CRITICALITY, APP_ENVIRONMENT, APP_KIND, AUDIT_ACTION, NOTICE_ALERT_OFFSET_DAYS, NOTICE_ALERT_STATUS, PERSON_STATUS} from '@/lib/constants';
import {noticeAlerts, people} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {archiveApp, createApp, getApp, listActiveApps, listArchivedApps, unarchiveApp, updateApp} from './apps';
import {ValidationError} from './errors';
import {listAuditEvents} from './notice-actions';
import {acknowledgeAlert} from './notice-alerts';
import {createPerson} from './people';

const TODAY = '2026-06-01';

describe('app domain model', () => {
  let t: TestDb;
  let ownerId: string;
  let backupId: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'})).id;
    backupId = (await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'})).id;
  });

  function saas(name: string, noticeDeadline: string | null = null) {
    return {name, kind: 'saas', ownerId, backupOwnerId: backupId, noticeDeadline};
  }

  async function markSent(alertId: string) {
    await t.db
      .update(noticeAlerts)
      .set({status: NOTICE_ALERT_STATUS.sent, sentAt: new Date('2026-07-01T08:00:00Z')})
      .where(eq(noticeAlerts.id, alertId));
  }

  async function alertsByStatus(appId: string, status: string) {
    return t.db
      .select()
      .from(noticeAlerts)
      .where(and(eq(noticeAlerts.appId, appId), eq(noticeAlerts.status, status)));
  }

  // [02] rules, now on Postgres.

  it('creates an app with name, kind, owner and backup owner', async () => {
    const app = await createApp(t.db, t.workspaceId, {
      ...saas('Northwind Mail', '2026-10-17'),
      renewalDate: '2027-01-15',
    }, TODAY);

    expect(app.name).toBe('Northwind Mail');
    expect(app.kind).toBe('saas');
    expect(app.owner).toEqual({id: ownerId, name: 'Ada Owner'});
    expect(app.backupOwner).toEqual({id: backupId, name: 'Ben Backup'});
    expect(app.renewalDate).toBe('2027-01-15');
    expect(app.noticeDeadline).toBe('2026-10-17');
  });

  it('rejects a kind outside the fixed MVP set', async () => {
    await expect(
      createApp(t.db, t.workspaceId, {...saas('Mystery Tool'), kind: 'spreadsheet'}),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('in-house fields are optional for every kind: add them now or later (Journey B, decision D6)', async () => {
    const helper = await createApp(t.db, t.workspaceId, {...saas('Sales Pipeline Helper'), kind: APP_KIND.citizenBuilt});
    expect(helper.runtimeLocation).toBeNull();

    const updated = await updateApp(t.db, t.workspaceId, helper.id, {
      runtimeLocation: 'Vercel under team account',
      dataAndKeys: 'Supabase service role key; CRM export CSV',
      whatBreaksIfStopped: 'Weekly sales forecast email stops updating',
    });
    expect(updated.runtimeLocation).toContain('Vercel');
    expect(updated.whatBreaksIfStopped).toMatch(/forecast/i);
  });

  it('the backup owner is optional, can be cleared with null, and still cannot be the owner', async () => {
    const solo = await createApp(t.db, t.workspaceId, {...saas('Solo Run'), backupOwnerId: undefined});
    expect(solo.backupOwner).toBeNull();
    const withBackup = await createApp(t.db, t.workspaceId, saas('Paired Run'));
    expect((await updateApp(t.db, t.workspaceId, withBackup.id, {backupOwnerId: null})).backupOwner).toBeNull();
    await expect(updateApp(t.db, t.workspaceId, solo.id, {backupOwnerId: ownerId})).rejects.toThrow(/must be different people/);
  });

  it('criticality is stored, shown as null until set, and must be low, medium, high or critical', async () => {
    const unset = await createApp(t.db, t.workspaceId, saas('Unrated Tool'));
    expect(unset.criticality).toBeNull();
    const rated = await createApp(t.db, t.workspaceId, {...saas('Rated Tool'), criticality: APP_CRITICALITY.critical});
    expect(rated.criticality).toBe(APP_CRITICALITY.critical);
    await expect(createApp(t.db, t.workspaceId, {...saas('Badly Rated'), criticality: 'urgent'})).rejects.toThrow(/criticality must be one of/);
  });

  it('environments are rows, each once and in a fixed order; an edit that leaves them out keeps them', async () => {
    const app = await createApp(t.db, t.workspaceId, {
      ...saas('Env Tool'),
      environments: [APP_ENVIRONMENT.staging, APP_ENVIRONMENT.production, APP_ENVIRONMENT.staging],
    });
    expect(app.environments).toEqual([APP_ENVIRONMENT.production, APP_ENVIRONMENT.staging]);
    expect((await updateApp(t.db, t.workspaceId, app.id, {name: 'Env Tool 2'})).environments).toEqual(app.environments);
    expect((await updateApp(t.db, t.workspaceId, app.id, {environments: []})).environments).toEqual([]);
    await expect(createApp(t.db, t.workspaceId, {...saas('Bad Env'), environments: ['moon']})).rejects.toThrow(/environments must be/);
  });

  it('a repository URL must be https; other schemes are refused so the link is always safe to show', async () => {
    const app = await createApp(t.db, t.workspaceId, {...saas('Repo Tool'), repositoryUrl: 'https://git.example.test/team/repo-tool'});
    expect(app.repositoryUrl).toBe('https://git.example.test/team/repo-tool');
    for (const repositoryUrl of ['javascript:alert(1)', 'http://git.example.test/x', 'not a url']) {
      await expect(createApp(t.db, t.workspaceId, {...saas(`Repo ${repositoryUrl.length}`), repositoryUrl})).rejects.toThrow(/https/);
    }
  });

  it('requires owner and backup owner to be different people', async () => {
    await expect(
      createApp(t.db, t.workspaceId, {...saas('Solo Owned'), backupOwnerId: ownerId}),
    ).rejects.toThrow(/must be different people/);
  });

  it('round-trips an app through the Postgres repository', async () => {
    const created = await createApp(t.db, t.workspaceId, {
      name: 'Fabricator Line Tool',
      kind: 'in_house',
      ownerId,
      backupOwnerId: backupId,
      vendor: 'Built in-house',
      costCents: 1999,
      runtimeLocation: 'On-prem VM shop-floor-01',
      dataAndKeys: 'Machine PLC credentials; production DB read role',
      whatBreaksIfStopped: 'Shift handoff checklist cannot be printed',
    });
    expect(await getApp(t.db, t.workspaceId, created.id)).toEqual(created);
  });

  it('rejects a notice deadline after the renewal date', async () => {
    await expect(
      createApp(t.db, t.workspaceId, {...saas('Bad Dates', '2026-07-01'), renewalDate: '2026-06-01'}),
    ).rejects.toThrow(/on or before the renewal date/);
  });

  it('rejects an empty app name', async () => {
    await expect(createApp(t.db, t.workspaceId, saas('   '))).rejects.toThrow(/name is required/);
  });

  // [10] acceptance criteria.

  it('creating an app with a notice deadline schedules one alert per offset due today or later', async () => {
    const app = await createApp(t.db, t.workspaceId, saas('Contoso CRM', '2026-12-31'), TODAY);

    expect(app.alerts.map((a) => [a.offsetDays, a.dueOn, a.status, a.noticeDeadline])).toEqual([
      [90, '2026-10-02', NOTICE_ALERT_STATUS.scheduled, '2026-12-31'],
      [60, '2026-11-01', NOTICE_ALERT_STATUS.scheduled, '2026-12-31'],
      [30, '2026-12-01', NOTICE_ALERT_STATUS.scheduled, '2026-12-31'],
    ]);
    expect(app.alerts).toHaveLength(NOTICE_ALERT_OFFSET_DAYS.length);
  });

  it("changing an app's notice deadline replaces its scheduled alerts and keeps sent and acknowledged ones", async () => {
    const app = await createApp(t.db, t.workspaceId, saas('Contoso CRM', '2026-12-31'), TODAY);
    const [ninety, sixty] = app.alerts;
    await markSent(ninety.id);
    await acknowledgeAlert(t.db, t.workspaceId, sixty.id);

    const updated = await updateApp(t.db, t.workspaceId, app.id, {noticeDeadline: '2027-03-31'}, TODAY);

    const kept = updated.alerts.filter((a) => a.noticeDeadline === '2026-12-31');
    expect(kept.map((a) => [a.offsetDays, a.status])).toEqual([
      [90, NOTICE_ALERT_STATUS.sent],
      [60, NOTICE_ALERT_STATUS.acknowledged],
    ]);
    const scheduled = await alertsByStatus(app.id, NOTICE_ALERT_STATUS.scheduled);
    expect(scheduled.map((a) => [a.noticeDeadline, a.dueOn]).sort()).toEqual([
      ['2027-03-31', '2026-12-31'],
      ['2027-03-31', '2027-01-30'],
      ['2027-03-31', '2027-03-01'],
    ]);
  });

  it('archived apps are left out of the active list and do not block reusing their name', async () => {
    const old = await createApp(t.db, t.workspaceId, saas('Fabrikam Drive', '2026-12-31'), TODAY);
    await archiveApp(t.db, t.workspaceId, old.id);

    expect(await listActiveApps(t.db, t.workspaceId)).toEqual([]);
    expect(await alertsByStatus(old.id, NOTICE_ALERT_STATUS.scheduled)).toEqual([]);

    const reused = await createApp(t.db, t.workspaceId, saas('fabrikam drive'), TODAY);
    expect((await listActiveApps(t.db, t.workspaceId)).map((a) => a.id)).toEqual([reused.id]);
    await expect(createApp(t.db, t.workspaceId, saas('FABRIKAM DRIVE'))).rejects.toThrow(
      /already exists/,
    );
  });

  it('[24] archiving lists the app under Archived; unarchiving brings it back with its alerts, and both are in the audit history', async () => {
    const actor = {name: 'API key "Ops"', keyId: null};
    const app = await createApp(t.db, t.workspaceId, saas('Fabrikam Drive', '2026-12-31'), TODAY);
    const scheduled = (await alertsByStatus(app.id, NOTICE_ALERT_STATUS.scheduled)).length;
    await archiveApp(t.db, t.workspaceId, app.id, actor);
    expect((await listArchivedApps(t.db, t.workspaceId)).map((row) => row.name)).toEqual(['Fabrikam Drive']);

    await unarchiveApp(t.db, t.workspaceId, app.id, actor, TODAY);
    expect((await listActiveApps(t.db, t.workspaceId)).map((row) => row.id)).toEqual([app.id]);
    expect(await listArchivedApps(t.db, t.workspaceId)).toEqual([]);
    expect(await alertsByStatus(app.id, NOTICE_ALERT_STATUS.scheduled)).toHaveLength(scheduled);
    const history = await listAuditEvents(t.db, t.workspaceId, {appId: app.id});
    expect(history.map((event) => [event.action, event.actor, event.appName])).toEqual([
      [AUDIT_ACTION.appUnarchived, actor.name, 'Fabrikam Drive'],
      [AUDIT_ACTION.appArchived, actor.name, 'Fabrikam Drive'],
    ]);

    // Unarchiving an active app changes nothing and records nothing.
    await unarchiveApp(t.db, t.workspaceId, app.id, actor, TODAY);
    expect(await listAuditEvents(t.db, t.workspaceId, {appId: app.id})).toHaveLength(2);
  });

  it('[24] an app cannot be unarchived while an active app has its name; nothing changes and nothing is recorded', async () => {
    const old = await createApp(t.db, t.workspaceId, saas('Fabrikam Drive'), TODAY);
    await archiveApp(t.db, t.workspaceId, old.id);
    await createApp(t.db, t.workspaceId, saas('fabrikam drive'), TODAY);

    await expect(unarchiveApp(t.db, t.workspaceId, old.id)).rejects.toThrow(/already exists/);
    expect((await getApp(t.db, t.workspaceId, old.id)).archivedAt).not.toBeNull();
    expect((await listAuditEvents(t.db, t.workspaceId, {appId: old.id})).map((event) => event.action)).toEqual([AUDIT_ACTION.appArchived]);
  });

  it('[24] only name, kind and owner are required to create an app; a missing one is refused by name', async () => {
    const minimal = await createApp(t.db, t.workspaceId, {name: 'Quill Notes', kind: APP_KIND.inHouse, ownerId});
    expect(minimal).toMatchObject({criticality: null, backupOwner: null, vendor: null, renewalDate: null, health: {score: null}});
    await expect(createApp(t.db, t.workspaceId, {name: '  ', kind: APP_KIND.inHouse, ownerId})).rejects.toThrow(/name is required/i);
    await expect(createApp(t.db, t.workspaceId, {name: 'X', kind: 'spaceship', ownerId})).rejects.toThrow(/kind/i);
  });

  // Edge cases.

  it('moving the deadline back to one that already had a sent alert does not duplicate it', async () => {
    const app = await createApp(t.db, t.workspaceId, saas('Litware HR', '2026-12-31'), TODAY);
    await markSent(app.alerts[0].id);

    await updateApp(t.db, t.workspaceId, app.id, {noticeDeadline: '2027-01-31'}, TODAY);
    const back = await updateApp(t.db, t.workspaceId, app.id, {noticeDeadline: '2026-12-31'}, TODAY);

    const current = back.alerts.filter((a) => a.noticeDeadline === '2026-12-31');
    expect(current.map((a) => [a.offsetDays, a.status])).toEqual([
      [90, NOTICE_ALERT_STATUS.sent],
      [60, NOTICE_ALERT_STATUS.scheduled],
      [30, NOTICE_ALERT_STATUS.scheduled],
    ]);
    expect(back.alerts).toHaveLength(3);
  });

  it('an update that makes the owner also the backup owner is refused and changes nothing', async () => {
    const app = await createApp(t.db, t.workspaceId, saas('Tailspin Tickets'), TODAY);

    await expect(
      updateApp(t.db, t.workspaceId, app.id, {backupOwnerId: ownerId}, TODAY),
    ).rejects.toThrow(/must be different people/);
    expect((await getApp(t.db, t.workspaceId, app.id)).backupOwner?.id).toBe(backupId);
  });

  it('an offset due exactly today is scheduled and offsets already past are skipped', async () => {
    const app = await createApp(t.db, t.workspaceId, saas('Woodgrove Payroll', '2026-12-31'), '2026-12-01');

    expect(app.alerts.map((a) => [a.offsetDays, a.dueOn])).toEqual([[30, '2026-12-01']]);
  });

  it('two edits to the same app at once keep both changes and leave alerts only for the final deadline', async () => {
    const app = await createApp(t.db, t.workspaceId, saas('Adatum Backup', '2026-12-31'), TODAY);

    await Promise.all([
      updateApp(t.db, t.workspaceId, app.id, {noticeDeadline: '2027-03-31'}, TODAY),
      updateApp(t.db, t.workspaceId, app.id, {vendor: 'Adatum'}, TODAY),
    ]);

    const final = await getApp(t.db, t.workspaceId, app.id);
    expect([final.noticeDeadline, final.vendor]).toEqual(['2027-03-31', 'Adatum']);
    const scheduled = await alertsByStatus(app.id, NOTICE_ALERT_STATUS.scheduled);
    expect(new Set(scheduled.map((a) => a.noticeDeadline))).toEqual(new Set(['2027-03-31']));
  });

  it('an app whose owner has left can still be edited, but a leaver cannot be newly assigned', async () => {
    const app = await createApp(t.db, t.workspaceId, saas('Proseware Wiki'), TODAY);
    const carl = await createPerson(t.db, t.workspaceId, {name: 'Carl Leaver', email: 'carl@example.test'});
    await t.db.update(people).set({status: PERSON_STATUS.left, leftOn: '2026-05-29'}).where(eq(people.id, ownerId));
    await t.db.update(people).set({status: PERSON_STATUS.left, leftOn: '2026-05-29'}).where(eq(people.id, carl.id));

    const edited = await updateApp(t.db, t.workspaceId, app.id, {vendor: 'Proseware'}, TODAY);
    expect(edited.vendor).toBe('Proseware');
    await expect(
      updateApp(t.db, t.workspaceId, app.id, {backupOwnerId: carl.id}, TODAY),
    ).rejects.toThrow(/active people/);
  });
});
