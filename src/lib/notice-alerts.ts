import {NOTICE_ALERT_OFFSET_DAYS} from './constants';

/**
 * Calendar dates (UTC YYYY-MM-DD) when notice-deadline alerts should fire.
 * Alerts are based on the notice deadline, not the renewal date.
 */
export function alertDatesBeforeNoticeDeadline(
  noticeDeadlineIso: string,
  offsetsDays: readonly number[] = NOTICE_ALERT_OFFSET_DAYS,
): string[] {
  const notice = parseIsoDateOnly(noticeDeadlineIso);
  if (!notice) {
    throw new Error(`Invalid notice deadline date: ${noticeDeadlineIso}`);
  }

  return offsetsDays.map((days) => {
    const alert = new Date(notice);
    alert.setUTCDate(alert.getUTCDate() - days);
    return formatIsoDateOnly(alert);
  });
}

/**
 * Whether an alert at the given offset should send on `todayIso`
 * for the given notice deadline.
 */
export function isNoticeAlertDue(args: {
  noticeDeadlineIso: string;
  offsetDays: number;
  todayIso: string;
}): boolean {
  const [due] = alertDatesBeforeNoticeDeadline(args.noticeDeadlineIso, [
    args.offsetDays,
  ]);
  return due === args.todayIso;
}

function parseIsoDateOnly(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

function formatIsoDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today's calendar date in UTC (YYYY-MM-DD), the clock every alert rule uses. */
export function todayIso(): string {
  return formatIsoDateOnly(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDateOnly(iso);
  if (!date) {
    throw new Error(`Invalid date: ${iso}`);
  }
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDateOnly(date);
}

export function isIsoDateOnly(value: string): boolean {
  return parseIsoDateOnly(value) !== null;
}

/**
 * The alerts to schedule for a notice deadline: one per offset whose due date
 * is today or later. Offsets already in the past are skipped.
 */
export function upcomingAlertsForDeadline(
  noticeDeadlineIso: string,
  todayIsoDate: string,
): {offsetDays: number; dueOn: string}[] {
  const dueDates = alertDatesBeforeNoticeDeadline(noticeDeadlineIso);
  return NOTICE_ALERT_OFFSET_DAYS.map((offsetDays, i) => ({
    offsetDays,
    dueOn: dueDates[i],
  })).filter((alert) => alert.dueOn >= todayIsoDate);
}
