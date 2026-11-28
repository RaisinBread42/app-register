import {readFileSync} from 'node:fs';
import {and, eq, isNull} from 'drizzle-orm';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {APP_KIND, APP_KINDS, PERSON_STATUS} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {appDependencies, apps, noticeAlerts, people} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApp} from '@/lib/services/apps';
import {createPerson} from '@/lib/services/people';
import {DEMO_APPS, DEMO_LEAVER_KEY, DEMO_PEOPLE, seedDemoData} from './demo-seed';

const TODAY = '2026-11-28';

describe('demo seed', () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await createTestDb();
  });
  afterEach(async () => {
    vi.useRealTimers();
    await t.client.close();
  });

  it('loads fictional SaaS and in-house apps, owners, deadlines in the 90/60/30 windows and a leaver', async () => {
    const result = await seedDemoData(t.db, t.workspaceId, TODAY);
    expect(result.appsCreated).toBe(DEMO_APPS.length);

    const rows = await t.db.select().from(apps).where(and(eq(apps.workspaceId, t.workspaceId), isNull(apps.archivedAt)));
    expect(new Set(rows.map((row) => row.kind))).toEqual(new Set(APP_KINDS));
    const alerts = await t.db.select().from(noticeAlerts).where(eq(noticeAlerts.workspaceId, t.workspaceId));
    expect(new Set(alerts.map((alert) => alert.offsetDays))).toEqual(new Set([90, 60, 30]));

    const leaver = DEMO_PEOPLE.find((person) => person.key === DEMO_LEAVER_KEY);
    const [left] = await t.db.select().from(people).where(eq(people.email, leaver!.email));
    expect(left.status).toBe(PERSON_STATUS.left);
    expect(rows.some((row) => row.ownerId === left.id)).toBe(true);
  });

  it('running it twice adds nothing the second time', async () => {
    await seedDemoData(t.db, t.workspaceId, TODAY);
    const again = await seedDemoData(t.db, t.workspaceId, TODAY);
    expect(again).toEqual({peopleCreated: 0, appsCreated: 0, appsSkipped: DEMO_APPS.length});
  });

  it('refuses a workspace that already holds real (non-demo) apps', async () => {
    const owner = await createPerson(t.db, t.workspaceId, {name: 'Real Owner', email: 'real@company.test'});
    const backup = await createPerson(t.db, t.workspaceId, {name: 'Real Backup', email: 'backup@company.test'});
    await createApp(t.db, t.workspaceId, {name: 'Real CRM', kind: APP_KIND.saas, ownerId: owner.id, backupOwnerId: backup.id});
    await expect(seedDemoData(t.db, t.workspaceId, TODAY)).rejects.toThrow(/not demo data/);
  });

  it('refuses a workspace whose only app is a real one that shares a demo app name', async () => {
    const owner = await createPerson(t.db, t.workspaceId, {name: 'Real Owner', email: 'owner@company.test'});
    const backup = await createPerson(t.db, t.workspaceId, {name: 'Real Backup', email: 'backup2@company.test'});
    await createApp(t.db, t.workspaceId, {name: 'Staff Directory', kind: APP_KIND.saas, ownerId: owner.id, backupOwnerId: backup.id});
    await expect(seedDemoData(t.db, t.workspaceId, TODAY)).rejects.toThrow(/not demo data/);
  });

  it('refuses a workspace that holds real people but no apps yet', async () => {
    await createPerson(t.db, t.workspaceId, {name: 'Real Person', email: 'person@company.test'});
    await expect(seedDemoData(t.db, t.workspaceId, TODAY)).rejects.toThrow(/not demo data/);
  });

  it('a second run on a later day leaves the leaver and their left-on date untouched', async () => {
    vi.useFakeTimers({toFake: ['Date'], now: new Date('2026-11-28T12:00:00Z')});
    await seedDemoData(t.db, t.workspaceId, TODAY);
    const email = DEMO_PEOPLE.find((person) => person.key === DEMO_LEAVER_KEY)!.email;
    const [before] = await t.db.select().from(people).where(eq(people.email, email));
    vi.setSystemTime(new Date('2026-12-05T12:00:00Z'));
    await seedDemoData(t.db, t.workspaceId, '2026-12-05');
    const [after] = await t.db.select().from(people).where(eq(people.email, email));
    expect({leftOn: after.leftOn, updatedAt: after.updatedAt.toISOString()}).toEqual({
      leftOn: before.leftOn,
      updatedAt: before.updatedAt.toISOString(),
    });
  });

  it('an interrupted run leaves nothing behind, so the next run builds every app completely', async () => {
    let calls = 0;
    const crashing = new Proxy(t.db, {
      get(target, prop) {
        if (prop === 'transaction') {
          return (...args: Parameters<AppDatabase['transaction']>) =>
            target.transaction(async (tx) => {
              const inner = new Proxy(tx, {
                get(innerTarget, innerProp) {
                  if (innerProp === 'transaction' && ++calls === 5) {
                    throw new Error('simulated crash');
                  }
                  const value = Reflect.get(innerTarget, innerProp, innerTarget);
                  return typeof value === 'function' ? value.bind(innerTarget) : value;
                },
              });
              return args[0](inner as typeof tx);
            });
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as AppDatabase;
    await expect(seedDemoData(crashing, t.workspaceId, TODAY)).rejects.toThrow('simulated crash');
    expect(await t.db.select().from(apps).where(eq(apps.workspaceId, t.workspaceId))).toHaveLength(0);

    await seedDemoData(t.db, t.workspaceId, TODAY);
    const [portal] = await t.db.select().from(apps).where(and(eq(apps.workspaceId, t.workspaceId), eq(apps.name, 'Northwind Portal')));
    const dependencies = await t.db.select().from(appDependencies).where(eq(appDependencies.appId, portal.id));
    expect(dependencies).toHaveLength(DEMO_APPS.find((app) => app.name === 'Northwind Portal')!.dependencies.length);
  });

  it('uses only made-up names, reserved example.test emails and DEMO- advisory ids', () => {
    expect(DEMO_PEOPLE.every((person) => person.email.endsWith('@example.test'))).toBe(true);
    const advisories = DEMO_APPS.flatMap((app) => app.dependencies.flatMap((dependency) => dependency.advisories));
    expect(advisories.every((advisory) => advisory.id.startsWith('DEMO-'))).toBe(true);
    expect(readFileSync('src/lib/seed/demo-seed.ts', 'utf8')).not.toMatch(/obsidian|meridian|northwind traders/i);
  });
});
