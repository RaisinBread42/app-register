import {eq} from 'drizzle-orm';
import {beforeEach, describe, expect, it} from 'vitest';
import {NOTICE_ALERT_STATUS} from '@/lib/constants';
import {apps} from '@/lib/db/schema';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApp} from './apps';
import {acknowledgeAlert, listAlerts} from './notice-alerts';
import {createPerson} from './people';

describe('notice alerts', () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
  });

  it('acknowledging an alert sets acknowledged_at (first time wins) and status only; the app and its deadline are unchanged', async () => {
    const owner = await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: 'ada@example.test'});
    const backup = await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: 'ben@example.test'});
    const app = await createApp(
      t.db,
      t.workspaceId,
      {name: 'Contoso CRM', kind: 'saas', ownerId: owner.id, backupOwnerId: backup.id, renewalDate: '2027-02-14', noticeDeadline: '2026-12-31'},
      '2026-06-01',
    );
    const [appBefore] = await t.db.select().from(apps).where(eq(apps.id, app.id));
    const [alert] = app.alerts;
    const seenAt = new Date('2026-10-03T09:15:00Z');

    const [acknowledged] = await Promise.all([
      acknowledgeAlert(t.db, t.workspaceId, alert.id, seenAt),
      acknowledgeAlert(t.db, t.workspaceId, alert.id, new Date('2026-10-03T10:00:00Z')),
    ]);

    expect(acknowledged).toEqual({
      ...alert,
      status: NOTICE_ALERT_STATUS.acknowledged,
      acknowledgedAt: seenAt,
      updatedAt: acknowledged.updatedAt,
    });
    const [appAfter] = await t.db.select().from(apps).where(eq(apps.id, app.id));
    expect(appAfter).toEqual(appBefore);
    const stillScheduled = await listAlerts(t.db, t.workspaceId, {status: NOTICE_ALERT_STATUS.scheduled});
    expect(stillScheduled).toHaveLength(2);
  });
});
