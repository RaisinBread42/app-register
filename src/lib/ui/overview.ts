import {DATE_KIND, MONITORING_SOURCE_STATUS, NOTICE_SEVERITY, type DateKind} from '@/lib/constants';
import {addDaysIso} from '@/lib/notice-alerts';
import type {App, MonitoringSource, Notice} from './api-client';
import {DEFAULT_INBOX_VIEW, inboxRows, type InboxRow} from './notice-inbox';

/**
 * The Overview's rules (spec §4.1, Journey A): what needs attention first, in a few
 * numbers and a short queue, then dates and the portfolio. Pure, so they are tested
 * without a page.
 */

/** How far ahead the key number and the date list look. */
export const OVERVIEW_DEADLINE_DAYS = 30;
export const OVERVIEW_DATES_DAYS = 90;
export const OVERVIEW_QUEUE_LIMIT = 5;
export const OVERVIEW_ACTIVITY_LIMIT = 5;

export type KeyNumbers = {needAttention: number; critical: number; deadlinesSoon: number; sourcesDown: number};

export function keyNumbers(notices: Notice[], apps: App[], sources: MonitoringSource[], today: string): KeyNumbers {
  const open = inboxRows(notices, DEFAULT_INBOX_VIEW);
  const until = addDaysIso(today, OVERVIEW_DEADLINE_DAYS);
  return {
    needAttention: open.length,
    critical: open.filter((row) => row.notice.severity === NOTICE_SEVERITY.critical).length,
    deadlinesSoon: apps.filter((app) => app.noticeDeadline !== null && app.noticeDeadline >= today && app.noticeDeadline <= until).length,
    sourcesDown: sources.filter((source) => source.status === MONITORING_SOURCE_STATUS.unavailable).length,
  };
}

/** The most urgent open notices, as the inbox orders them. Snoozed and handled ones are counted elsewhere, never hidden silently. */
export function urgentQueue(notices: Notice[], limit = OVERVIEW_QUEUE_LIMIT): InboxRow[] {
  return inboxRows(notices, DEFAULT_INBOX_VIEW).slice(0, limit);
}

export type DateRowData = {appId: string; title: string; date: string; kind: DateKind};

/** Notice deadlines and renewals in the next 90 days, soonest first; past ones that are not yet decided are [34]. */
export function upcomingDates(apps: App[], today: string, days = OVERVIEW_DATES_DAYS): DateRowData[] {
  const until = addDaysIso(today, days);
  const rows: DateRowData[] = apps.flatMap((app) => [
    ...(app.noticeDeadline && app.noticeDeadline >= today && app.noticeDeadline <= until
      ? [{appId: app.id, title: `${app.name} notice deadline`, date: app.noticeDeadline, kind: DATE_KIND.notice}]
      : []),
    ...(app.renewalDate && app.renewalDate >= today && app.renewalDate <= until
      ? [{appId: app.id, title: `${app.name} renewal`, date: app.renewalDate, kind: DATE_KIND.renewal}]
      : []),
  ]);
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export type PortfolioSummary = {total: number; monitored: number; notMonitored: number; withOpenNotices: number};

/** Monitored means something can check it (a health score exists); the rest are named, not hidden or called healthy. */
export function portfolioSummary(apps: App[], notices: Notice[]): PortfolioSummary {
  const withOpen = new Set(inboxRows(notices, DEFAULT_INBOX_VIEW).map((row) => row.match.app.id));
  const monitored = apps.filter((app) => app.health.score !== null).length;
  return {total: apps.length, monitored, notMonitored: apps.length - monitored, withOpenNotices: withOpen.size};
}

/** The latest time any source answered, or null when none has yet. */
export function lastSuccessfulCheck(sources: MonitoringSource[]): string | null {
  const times = sources
    .filter((source) => source.status === MONITORING_SOURCE_STATUS.reachable && source.lastRefreshedAt)
    .map((source) => source.lastRefreshedAt as string);
  return times.length ? times.sort().at(-1)! : null;
}
