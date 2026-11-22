import {and, eq} from 'drizzle-orm';
import {beforeEach, describe, expect, it} from 'vitest';
import {NOTICE_ALERT_OFFSET_DAYS, NOTICE_ALERT_STATUS, PERSON_STATUS} from '@/lib/constants';
import {noticeAlerts, people} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {archiveApp, createApp, getApp, listActiveApps, updateApp} from './apps';
import {ValidationError} from './errors';
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

  it('requires in-house risk fields for in-house and citizen-built apps', async () => {
    const helper = {...saas('Sales Pipeline Helper'), kind: 'citizen_built'};
    await expect(createApp(t.db, t.workspaceId, helper)).rejects.toThrow(/In-house apps require/);

    const app = await createApp(t.db, t.workspaceId, {
      ...helper,
      runtimeLocation: 'Vercel under team account',
      dataAndKeys: 'Supabase service role key; CRM export CSV',
      whatBreaksIfStopped: 'Weekly sales forecast email stops updating',
    });
    expect(app.runtimeLocation).toContain('Vercel');
    expect(app.whatBreaksIfStopped).toMatch(/forecast/i);
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
    expect((await getApp(t.db, t.workspaceId, app.id)).backupOwner.id).toBe(backupId);
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
