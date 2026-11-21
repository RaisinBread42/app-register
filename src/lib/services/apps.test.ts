import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createDb, migrateSchema, type AppDatabase} from '@/lib/db/client';
import {
  AppValidationError,
  createApp,
  createPerson,
  getAppById,
} from './apps';

describe('app domain model', () => {
  let db: AppDatabase;
  let ownerId: string;
  let backupId: string;

  beforeEach(async () => {
    db = createDb(':memory:');
    migrateSchema(db);
    ownerId = (await createPerson(db, {name: 'Ada Owner', email: 'ada@example.test'})).id;
    backupId = (
      await createPerson(db, {name: 'Ben Backup', email: 'ben@example.test'})
    ).id;
  });

  afterEach(() => {
    // better-sqlite3 memory DB is dropped with process; nothing to close required for tests
  });

  it('creates an app with name, kind, owner and backup owner', async () => {
    const app = await createApp(db, {
      name: 'Northwind Mail',
      kind: 'saas',
      ownerId,
      backupOwnerId: backupId,
      renewalDate: '2027-01-15',
      noticeDeadline: '2026-10-17',
    });

    expect(app.name).toBe('Northwind Mail');
    expect(app.kind).toBe('saas');
    expect(app.ownerId).toBe(ownerId);
    expect(app.backupOwnerId).toBe(backupId);
    expect(app.renewalDate).toBe('2027-01-15');
    expect(app.noticeDeadline).toBe('2026-10-17');
  });

  it('rejects a kind outside the fixed MVP set', async () => {
    await expect(
      createApp(db, {
        name: 'Mystery Tool',
        kind: 'spreadsheet',
        ownerId,
        backupOwnerId: backupId,
      }),
    ).rejects.toBeInstanceOf(AppValidationError);
  });

  it('requires in-house risk fields for in-house and citizen-built apps', async () => {
    await expect(
      createApp(db, {
        name: 'Sales Pipeline Helper',
        kind: 'citizen_built',
        ownerId,
        backupOwnerId: backupId,
      }),
    ).rejects.toThrow(/In-house apps require/);

    const app = await createApp(db, {
      name: 'Sales Pipeline Helper',
      kind: 'citizen_built',
      ownerId,
      backupOwnerId: backupId,
      runtimeLocation: 'Vercel under team account',
      dataAndKeys: 'Supabase service role key; CRM export CSV',
      whatBreaksIfStopped: 'Weekly sales forecast email stops updating',
    });

    expect(app.runtimeLocation).toContain('Vercel');
    expect(app.whatBreaksIfStopped).toMatch(/forecast/i);
  });

  it('requires owner and backup owner to be different people', async () => {
    await expect(
      createApp(db, {
        name: 'Solo Owned',
        kind: 'saas',
        ownerId,
        backupOwnerId: ownerId,
      }),
    ).rejects.toThrow(/must be different people/);
  });

  it('round-trips an app through the SQLite repository', async () => {
    const created = await createApp(db, {
      name: 'Fabricator Line Tool',
      kind: 'in_house',
      ownerId,
      backupOwnerId: backupId,
      runtimeLocation: 'On-prem VM shop-floor-01',
      dataAndKeys: 'Machine PLC credentials; production DB read role',
      whatBreaksIfStopped: 'Shift handoff checklist cannot be printed',
    });

    const loaded = await getAppById(db, created.id);
    expect(loaded).toEqual(created);
  });

  it('rejects a notice deadline after the renewal date', async () => {
    await expect(
      createApp(db, {
        name: 'Bad Dates',
        kind: 'saas',
        ownerId,
        backupOwnerId: backupId,
        renewalDate: '2026-06-01',
        noticeDeadline: '2026-07-01',
      }),
    ).rejects.toThrow(/on or before the renewal date/);
  });

  it('rejects an empty app name', async () => {
    await expect(
      createApp(db, {
        name: '   ',
        kind: 'saas',
        ownerId,
        backupOwnerId: backupId,
      }),
    ).rejects.toThrow(/name is required/);
  });
});
