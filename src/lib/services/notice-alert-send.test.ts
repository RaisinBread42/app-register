import {beforeEach, describe, expect, it, vi} from 'vitest';
import {NOTICE_ALERT_OFFSET_DAYS, NOTICE_ALERT_STATUS} from '@/lib/constants';
import {addDaysIso} from '@/lib/notice-alerts';
import {createSinkEmail} from '@/lib/email';
import {createTestDb, type TestDb} from '@/lib/db/test-db';
import {createApp} from './apps';
import {sendDueNoticeAlerts} from './notice-alert-send';
import {listAlerts} from './notice-alerts';
import {createPerson} from './people';

const TODAY = '2026-06-01';
const FROM = 'alerts@example.com';
const APP_URL = 'http://register.test';

describe('notice-deadline email alerts', () => {
  let t: TestDb;
  let ownerId: string;
  let backupId: string;
  let ownerEmail: string;
  let backupEmail: string;

  beforeEach(async () => {
    t = await createTestDb();
    ownerEmail = 'ada.owner@example.test';
    backupEmail = 'ben.backup@example.test';
    ownerId = (await createPerson(t.db, t.workspaceId, {name: 'Ada Owner', email: ownerEmail})).id;
    backupId = (await createPerson(t.db, t.workspaceId, {name: 'Ben Backup', email: backupEmail})).id;
  });

  function appInput(name: string, noticeDeadline: string) {
    return {
      name,
      kind: 'saas' as const,
      ownerId,
      backupOwnerId: backupId,
      renewalDate: addDaysIso(noticeDeadline, 45),
      noticeDeadline,
    };
  }

  /** Criterion 2: the runner selects due alerts and the sink receives the emails. */
  it('a daily send selects due alerts and delivers them through the email port', async () => {
    const sink = createSinkEmail();
    const dueIn90 = addDaysIso(TODAY, 90);
    await createApp(t.db, t.workspaceId, appInput('Northwind Books', dueIn90), TODAY);

    const result = await sendDueNoticeAlerts(t.db, t.workspaceId, {
      email: sink,
      from: FROM,
      appUrl: APP_URL,
      today: TODAY,
    });

    expect(result).toEqual({sent: 1});
    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0]).toMatchObject({
      from: FROM,
      to: expect.arrayContaining([ownerEmail, backupEmail]),
      subject: expect.stringContaining('90'),
    });
    expect(sink.messages[0].subject).toContain('Northwind Books');
    expect(sink.messages[0].text).toContain(dueIn90);
    expect(sink.messages[0].text).toContain(`${APP_URL}/applications/`);
  });

  /** Criterion 3: each alert is sent at most once per app per offset. */
  it('each alert is sent at most once per app per offset', async () => {
    const sink = createSinkEmail();
    await createApp(
      t.db,
      t.workspaceId,
      appInput('Contoso CRM', addDaysIso(TODAY, 30)),
      TODAY,
    );

    const first = await sendDueNoticeAlerts(t.db, t.workspaceId, {
      email: sink,
      from: FROM,
      today: TODAY,
    });
    const second = await sendDueNoticeAlerts(t.db, t.workspaceId, {
      email: sink,
      from: FROM,
      today: TODAY,
    });

    expect(first).toEqual({sent: 1});
    expect(second).toEqual({sent: 0});
    expect(sink.messages).toHaveLength(1);
    const alerts = await listAlerts(t.db, t.workspaceId, {status: NOTICE_ALERT_STATUS.sent});
    expect(alerts).toHaveLength(1);
    expect(alerts[0].offsetDays).toBe(30);
    expect(alerts[0].sentAt).toBeInstanceOf(Date);
  });

  /** Criterion 4: email goes to owner and backup owner addresses. */
  it('email goes to the owner and backup owner addresses', async () => {
    const sink = createSinkEmail();
    await createApp(
      t.db,
      t.workspaceId,
      appInput('Fabrikam Drive', addDaysIso(TODAY, 60)),
      TODAY,
    );

    await sendDueNoticeAlerts(t.db, t.workspaceId, {
      email: sink,
      from: FROM,
      today: TODAY,
    });

    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0].to).toEqual([ownerEmail, backupEmail]);
  });

  // Edge cases.

  it('seed fixtures at 90, 60, 30 and 0 days out only send the offsets due today', async () => {
    const sink = createSinkEmail();
    await createApp(t.db, t.workspaceId, appInput('Ninety Out', addDaysIso(TODAY, 90)), TODAY);
    await createApp(t.db, t.workspaceId, appInput('Sixty Out', addDaysIso(TODAY, 60)), TODAY);
    await createApp(t.db, t.workspaceId, appInput('Thirty Out', addDaysIso(TODAY, 30)), TODAY);
    await createApp(t.db, t.workspaceId, appInput('Due Today', TODAY), TODAY);

    const result = await sendDueNoticeAlerts(t.db, t.workspaceId, {
      email: sink,
      from: FROM,
      today: TODAY,
    });

    expect(result.sent).toBe(3);
    expect(sink.messages.map((m) => m.subject).sort()).toEqual([
      'Notice deadline in 30 days: Thirty Out',
      'Notice deadline in 60 days: Sixty Out',
      'Notice deadline in 90 days: Ninety Out',
    ]);
    expect(NOTICE_ALERT_OFFSET_DAYS).toEqual([90, 60, 30]);
    const dueToday = await listAlerts(t.db, t.workspaceId);
    expect(dueToday.filter((a) => a.appName === 'Due Today')).toEqual([]);
  });

  it('an alert due tomorrow waits; an overdue scheduled alert still sends', async () => {
    const sink = createSinkEmail();
    const deadline = addDaysIso(TODAY, 90);
    await createApp(t.db, t.workspaceId, appInput('Litware HR', deadline), TODAY);

    expect(
      await sendDueNoticeAlerts(t.db, t.workspaceId, {
        email: sink,
        from: FROM,
        today: addDaysIso(TODAY, -1),
      }),
    ).toEqual({sent: 0});
    expect(sink.messages).toHaveLength(0);

    expect(
      await sendDueNoticeAlerts(t.db, t.workspaceId, {
        email: sink,
        from: FROM,
        today: addDaysIso(TODAY, 1),
      }),
    ).toEqual({sent: 1});
    expect(sink.messages).toHaveLength(1);
  });

  it('send failures leave the alert scheduled and never put an email address in the log', async () => {
    const failing = {
      send: vi.fn(async () => {
        throw new Error(`SMTP refused ${ownerEmail}`);
      }),
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await createApp(
      t.db,
      t.workspaceId,
      appInput('Woodgrove Payroll', addDaysIso(TODAY, 30)),
      TODAY,
    );

    const result = await sendDueNoticeAlerts(t.db, t.workspaceId, {
      email: failing,
      from: FROM,
      today: TODAY,
    });

    expect(result).toEqual({sent: 0});
    const scheduled = await listAlerts(t.db, t.workspaceId, {status: NOTICE_ALERT_STATUS.scheduled});
    expect(scheduled).toHaveLength(1);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(ownerEmail);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(backupEmail);
    logged.mockRestore();
  });
});
