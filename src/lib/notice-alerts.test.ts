import {describe, expect, it} from 'vitest';
import {NOTICE_ALERT_OFFSET_DAYS} from './constants';
import {
  alertDatesBeforeNoticeDeadline,
  isNoticeAlertDue,
} from './notice-alerts';

describe('notice deadline alert dates', () => {
  it('alerts fire 90, 60 and 30 days before the notice deadline', () => {
    // Criterion: offsets are before the notice deadline, not the renewal date.
    const dates = alertDatesBeforeNoticeDeadline('2026-12-31');
    expect(NOTICE_ALERT_OFFSET_DAYS).toEqual([90, 60, 30]);
    expect(dates).toEqual(['2026-10-02', '2026-11-01', '2026-12-01']);
  });

  it('marks an alert due only on the exact offset day', () => {
    expect(
      isNoticeAlertDue({
        noticeDeadlineIso: '2026-12-31',
        offsetDays: 30,
        todayIso: '2026-12-01',
      }),
    ).toBe(true);

    expect(
      isNoticeAlertDue({
        noticeDeadlineIso: '2026-12-31',
        offsetDays: 30,
        todayIso: '2026-12-02',
      }),
    ).toBe(false);
  });

  it('rejects a malformed notice deadline date', () => {
    expect(() => alertDatesBeforeNoticeDeadline('31-12-2026')).toThrow(
      /Invalid notice deadline date/,
    );
  });

  it('handles month and year boundaries when subtracting offsets', () => {
    expect(alertDatesBeforeNoticeDeadline('2026-03-01', [1])).toEqual([
      '2026-02-28',
    ]);
    expect(alertDatesBeforeNoticeDeadline('2024-03-01', [1])).toEqual([
      '2024-02-29',
    ]);
  });
});
