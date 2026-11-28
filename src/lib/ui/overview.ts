import {
  DATE_KIND,
  MATCH_STATUS,
  MONITORING_SOURCE_STATUS,
  NOTICE_SEVERITY,
  OVERVIEW_DATES_DAYS,
  OVERVIEW_DEADLINE_DAYS,
  OVERVIEW_OVERDUE_DAYS,
  OVERVIEW_QUEUE_LIMIT,
  type DateKind,
} from '@/lib/constants';
import {addDaysIso} from '@/lib/notice-alerts';
import type {App, MonitoringSource, Notice} from './api-client';
import {staleSources} from './freshness';
import {DEFAULT_INBOX_VIEW, INBOX_STATUS, inboxRows, type InboxRow} from './notice-inbox';
import {formatDateTime} from './register-view';

/**
 * The Overview's rules (spec §4.1, Journey A): what needs attention first, in a few
 * numbers and a short queue, then dates and the portfolio. Pure, so they are tested
 * without a page. Nothing unhandled drops out silently: snoozed notices and passed
 * notice deadlines are counted and shown.
 */

export type KeyNumbers = {
  /** Open notices (new or in review). */
  needAttention: number;
  critical: number;
  inReview: number;
  /** Counted apart from the open ones, never hidden. */
  snoozed: number;
  deadlinesSoon: number;
  /** Notice deadlines that passed in the last 30 days. */
  overdue: number;
  /** Sources whose last check failed or is older than the freshness window. */
  staleSources: number;
};

export function keyNumbers(notices: Notice[], apps: App[], sources: MonitoringSource[], today: string, now = new Date(`${today}T12:00:00Z`)): KeyNumbers {
  const open = inboxRows(notices, DEFAULT_INBOX_VIEW);
  const until = addDaysIso(today, OVERVIEW_DEADLINE_DAYS);
  return {
    needAttention: open.length,
    critical: open.filter((row) => row.notice.severity === NOTICE_SEVERITY.critical).length,
    inReview: open.filter((row) => row.match.status === MATCH_STATUS.reviewing).length,
    snoozed: inboxRows(notices, {...DEFAULT_INBOX_VIEW, status: INBOX_STATUS.snoozed}).length,
    deadlinesSoon: apps.filter((app) => app.noticeDeadline !== null && app.noticeDeadline >= today && app.noticeDeadline <= until).length,
    overdue: apps.filter((app) => isOverdue(app.noticeDeadline, today)).length,
    staleSources: staleSources(sources, now).length,
  };
}

/** A notice deadline that passed in the last 30 days: it may have renewed without a decision, so it stays in view. */
function isOverdue(noticeDeadline: string | null, today: string): boolean {
  return noticeDeadline !== null && noticeDeadline < today && noticeDeadline >= addDaysIso(today, -OVERVIEW_OVERDUE_DAYS);
}

/** The most urgent open notices, as the inbox orders them. Snoozed and handled ones are counted elsewhere, never hidden silently. */
export function urgentQueue(notices: Notice[], limit = OVERVIEW_QUEUE_LIMIT): InboxRow[] {
  return inboxRows(notices, DEFAULT_INBOX_VIEW).slice(0, limit);
}

export type DateRowData = {appId: string; title: string; date: string; kind: DateKind; isOverdue: boolean};

/** Notice deadlines that passed in the last 30 days (first), then notice deadlines and renewals in the next 90 days, soonest first. */
export function upcomingDates(apps: App[], today: string, days = OVERVIEW_DATES_DAYS): DateRowData[] {
  const until = addDaysIso(today, days);
  const rows: DateRowData[] = apps.flatMap((app) => [
    ...(app.noticeDeadline && (isOverdue(app.noticeDeadline, today) || (app.noticeDeadline >= today && app.noticeDeadline <= until))
      ? [{appId: app.id, title: `${app.name} notice deadline`, date: app.noticeDeadline, kind: DATE_KIND.notice, isOverdue: app.noticeDeadline < today}]
      : []),
    ...(app.renewalDate && app.renewalDate >= today && app.renewalDate <= until
      ? [{appId: app.id, title: `${app.name} renewal`, date: app.renewalDate, kind: DATE_KIND.renewal, isOverdue: false}]
      : []),
  ]);
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export type PortfolioSummary = {total: number; monitored: number; notMonitored: number; withOpenNotices: number};

/** Monitored means something has been checked (a health score exists); the rest are named, not hidden or called healthy. */
export function portfolioSummary(apps: App[], notices: Notice[]): PortfolioSummary {
  const withOpen = new Set(inboxRows(notices, DEFAULT_INBOX_VIEW).map((row) => row.match.app.id));
  const monitored = apps.filter((app) => app.health.score !== null).length;
  return {total: apps.length, monitored, notMonitored: apps.length - monitored, withOpenNotices: withOpen.size};
}

/** The portfolio line under the totals. An app with no score may have nothing recorded, or not be checked yet. */
export function portfolioNote(summary: PortfolioSummary): string {
  return summary.notMonitored
    ? `${summary.monitored} have a health score. ${summary.notMonitored} have none yet (nothing recorded to check, or not checked yet), so they are not counted as healthy.`
    : `All ${summary.monitored} have a health score.`;
}

/** The latest time any source answered, or null when none has yet. */
export function lastSuccessfulCheck(sources: MonitoringSource[]): string | null {
  const times = sources
    .filter((source) => source.status === MONITORING_SOURCE_STATUS.reachable && source.lastRefreshedAt)
    .map((source) => source.lastRefreshedAt as string);
  return times.length ? times.sort().at(-1)! : null;
}

/** The header line: when data was last good, or why there is no such time. */
export function checkStatusLine(sources: MonitoringSource[] | null): string {
  if (sources === null) {
    return 'Could not read the monitoring sources just now.';
  }
  const last = lastSuccessfulCheck(sources);
  if (last) {
    return `Last successful check: ${formatDateTime(last)}`;
  }
  return sources.some((source) => source.status === MONITORING_SOURCE_STATUS.unavailable)
    ? 'No source answered on the last check.'
    : 'No source has been checked yet.';
}
