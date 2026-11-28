import {readFileSync} from 'node:fs';
import {and, eq, isNull} from 'drizzle-orm';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {APP_KIND, APP_KINDS, PERSON_STATUS} from '@/lib/constants';
import {apps, noticeAlerts, people} from '@/lib/db/schema';
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

  it('uses only made-up names, reserved example.test emails and DEMO- advisory ids', () => {
    expect(DEMO_PEOPLE.every((person) => person.email.endsWith('@example.test'))).toBe(true);
    const advisories = DEMO_APPS.flatMap((app) => app.dependencies.flatMap((dependency) => dependency.advisories));
    expect(advisories.every((advisory) => advisory.id.startsWith('DEMO-'))).toBe(true);
    expect(readFileSync('src/lib/seed/demo-seed.ts', 'utf8')).not.toMatch(/obsidian|meridian|northwind traders/i);
  });
});
