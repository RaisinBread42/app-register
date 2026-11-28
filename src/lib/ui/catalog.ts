import {
  APP_CRITICALITY,
  APP_HEALTH_FILTER,
  APP_LIST_SORT,
  DATE_KIND,
  FILTER_ALL,
  HEALTH_ATTENTION_BELOW,
  NOTICE_SEVERITIES,
  type AppCriticality,
  type AppListSort,
  type DateKind,
} from '@/lib/constants';
import type {App, Notice} from './api-client';
import {DEFAULT_INBOX_VIEW, inboxRows, SEVERITY_RANK, type InboxRow} from './notice-inbox';

/**
 * The applications catalog's rules (spec §4, §4.1): the filters the URL holds, each
 * app's highest active issue, and the orders that put the apps needing attention
 * first. Pure, so they are tested without a page.
 */

export type AppListView = {
  query: string;
  kind: string;
  criticality: string;
  /** An owner's person id, or all. */
  owner: string;
  health: string;
  /** Only applications with an open (new or reviewing) notice. */
  openNotices: boolean;
  sort: AppListSort;
};

export const DEFAULT_APP_LIST_VIEW: AppListView = {
  query: '',
  kind: FILTER_ALL,
  criticality: FILTER_ALL,
  owner: FILTER_ALL,
  health: FILTER_ALL,
  openNotices: false,
  sort: APP_LIST_SORT.attention,
};

/** True when any filter or the search narrows the list (the sort does not). */
export function isFiltered(view: AppListView): boolean {
  return (
    view.query.trim() !== '' ||
    view.kind !== FILTER_ALL ||
    view.criticality !== FILTER_ALL ||
    view.owner !== FILTER_ALL ||
    view.health !== FILTER_ALL ||
    view.openNotices
  );
}

/** Each app's most severe open notice, as the inbox orders them. Snoozed and handled ones are not active. */
export function topIssues(notices: Notice[]): Map<string, InboxRow> {
  const issues = new Map<string, InboxRow>();
  for (const row of inboxRows(notices, DEFAULT_INBOX_VIEW)) {
    if (!issues.has(row.match.app.id)) {
      issues.set(row.match.app.id, row);
    }
  }
  return issues;
}

export type NextDate = {date: string; kind: DateKind};

/** The app's next notice deadline or renewal on or after `today`, or null when neither is ahead. */
export function nextDate(app: App, today: string): NextDate | null {
  const dates: NextDate[] = [
    ...(app.noticeDeadline && app.noticeDeadline >= today ? [{date: app.noticeDeadline, kind: DATE_KIND.notice}] : []),
    ...(app.renewalDate && app.renewalDate >= today ? [{date: app.renewalDate, kind: DATE_KIND.renewal}] : []),
  ];
  return dates.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** The distinct owners of these apps, by name, for the owner filter. */
export function catalogOwners(apps: App[]): {value: string; label: string}[] {
  const owners = new Map(apps.map((app) => [app.owner.id, app.owner.name]));
  return [...owners].map(([value, label]) => ({value, label})).sort((a, b) => a.label.localeCompare(b.label));
}

/** The list as the view asks: search, filters, then the chosen order. */
export function applyAppListView(apps: App[], view: AppListView, issues: Map<string, InboxRow>, today: string): App[] {
  const needle = view.query.trim().toLowerCase();
  const shown = apps.filter(
    (app) =>
      (!needle || app.name.toLowerCase().includes(needle)) &&
      (view.kind === FILTER_ALL || app.kind === view.kind) &&
      (view.criticality === FILTER_ALL || app.criticality === view.criticality) &&
      (view.owner === FILTER_ALL || app.owner.id === view.owner) &&
      matchesHealth(app, view.health) &&
      (!view.openNotices || issues.has(app.id)),
  );
  return shown.sort(comparator(view.sort, issues, today));
}

function comparator(sort: AppListSort, issues: Map<string, InboxRow>, today: string): (a: App, b: App) => number {
  const byName = (a: App, b: App) => a.name.localeCompare(b.name);
  switch (sort) {
    case APP_LIST_SORT.name:
      return byName;
    case APP_LIST_SORT.health:
      return (a, b) => byScore(a, b) || byName(a, b);
    case APP_LIST_SORT.deadline:
      return (a, b) => byDate(nextDate(a, today), nextDate(b, today)) || byName(a, b);
    default:
      return (a, b) => issueRank(a, issues) - issueRank(b, issues) || criticalityRank(a) - criticalityRank(b) || byScore(a, b) || byName(a, b);
  }
}

const NO_ISSUE_RANK = NOTICE_SEVERITIES.length;
const issueRank = (app: App, issues: Map<string, InboxRow>) => {
  const issue = issues.get(app.id);
  return issue ? SEVERITY_RANK[issue.notice.severity] : NO_ISSUE_RANK;
};

const CRITICALITY_RANK: Record<AppCriticality, number> = {
  [APP_CRITICALITY.critical]: 0,
  [APP_CRITICALITY.high]: 1,
  [APP_CRITICALITY.medium]: 2,
  [APP_CRITICALITY.low]: 3,
};
const NO_CRITICALITY_RANK = Object.keys(CRITICALITY_RANK).length;
const criticalityRank = (app: App) => (app.criticality ? CRITICALITY_RANK[app.criticality] : NO_CRITICALITY_RANK);

/** Lowest score first; apps with no score last. */
function byScore(a: App, b: App): number {
  const [left, right] = [a.health.score, b.health.score];
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

/** Soonest first; apps with nothing ahead last. */
function byDate(a: NextDate | null, b: NextDate | null): number {
  if (a?.date === b?.date) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.date.localeCompare(b.date);
}

/** Needs attention is a score below 95, healthy 95 or more; not monitored is no score. */
function matchesHealth(app: App, filter: string): boolean {
  const {score} = app.health;
  switch (filter) {
    case APP_HEALTH_FILTER.attention:
      return score !== null && score < HEALTH_ATTENTION_BELOW;
    case APP_HEALTH_FILTER.healthy:
      return score !== null && score >= HEALTH_ATTENTION_BELOW;
    case APP_HEALTH_FILTER.notMonitored:
      return score === null;
    default:
      return true;
  }
}
