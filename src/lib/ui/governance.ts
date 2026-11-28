import {
  APP_HEALTH_FILTER,
  GOVERNANCE_UPCOMING_DAYS,
  MATCH_STATUS,
  NOTICE_CATEGORIES,
  NOTICE_SEVERITIES,
  NOTICE_SEVERITY,
  ROUTES,
  appRoute,
  type NoticeCategory,
  type NoticeSeverity,
} from '@/lib/constants';
import {addDaysIso} from '@/lib/notice-alerts';
import type {App, Notice, NoticeMatch} from './api-client';
import {DEFAULT_APP_LIST_VIEW, matchesHealth} from './catalog';
import {appListQuery} from './list-filters';
import {DEFAULT_INBOX_VIEW, INBOX_STATUS, inboxQuery, inboxRows, type InboxView} from './notice-inbox';
import {isOverdue} from './overview';

/**
 * The Governance Board's figures ([49], docs/product/governance-board.md): a light
 * reporting layer over data the register already holds. Nothing here is monitored or
 * entered. Every figure is counted with the very filter of the Applications or Notices
 * list it links to, so the drill-down always shows exactly that many. Pure, so each
 * figure is tested without a page.
 */

/** A number with the list it drills down to. */
export type Figure = {count: number; href: string};

/** One item in a list on the board, linked to the app or notice it is about. */
export type NamedLink = {label: string; detail: string; href: string};

const appsHref = (view: Partial<typeof DEFAULT_APP_LIST_VIEW>) => `${ROUTES.applications}${appListQuery({...DEFAULT_APP_LIST_VIEW, ...view})}`;
const noticesHref = (view: Partial<InboxView>) => `${ROUTES.notices}${inboxQuery({...DEFAULT_INBOX_VIEW, ...view})}`;
const appLink = (app: Pick<App, 'id' | 'name'>, detail: string): NamedLink => ({label: app.name, detail, href: appRoute(app.id)});
const matchLink = (notice: Notice, match: NoticeMatch): NamedLink => ({label: notice.title, detail: match.app.name, href: noticesHref({notice: match.id})});

/** The portfolio figures, in the order the board shows them. Critical and out-of-date are among those needing attention. */
export const PORTFOLIO_FIGURES = [
  APP_HEALTH_FILTER.attention,
  APP_HEALTH_FILTER.critical,
  APP_HEALTH_FILTER.stale,
  APP_HEALTH_FILTER.notMonitored,
  APP_HEALTH_FILTER.healthy,
] as const;
export type PortfolioFigure = (typeof PORTFOLIO_FIGURES)[number];

export type PortfolioHealth = {total: number; figures: Record<PortfolioFigure, Figure>; coverage: {checked: number; total: number}};

/** Apps by health, each figure counted with the Applications list's own health filter, and how many have a score (coverage). */
export function portfolioHealth(apps: App[]): PortfolioHealth {
  const figures = Object.fromEntries(
    PORTFOLIO_FIGURES.map((filter) => [filter, {count: apps.filter((app) => matchesHealth(app, filter)).length, href: appsHref({health: filter})}]),
  ) as Record<PortfolioFigure, Figure>;
  return {total: apps.length, figures, coverage: {checked: apps.length - figures[APP_HEALTH_FILTER.notMonitored].count, total: apps.length}};
}

/** A figure for an inbox view: counted with the rows that view shows. */
function noticeFigure(notices: Notice[], view: Partial<InboxView>, today: string): Figure {
  return {count: inboxRows(notices, {...DEFAULT_INBOX_VIEW, ...view}, today).length, href: noticesHref(view)};
}

/** Open notices on active apps by severity, most severe first. */
export function openBySeverity(notices: Notice[], today: string): {severity: NoticeSeverity; open: Figure}[] {
  return NOTICE_SEVERITIES.map((severity) => ({severity, open: noticeFigure(notices, {severity}, today)}));
}

export type CategoryRisk = {
  category: NoticeCategory;
  open: Figure;
  critical: Figure;
  /** Remediation: the open ones split into new and in review, then snoozed, and handled in the last 30 days. */
  newCount: number;
  reviewing: number;
  snoozed: Figure;
  handledRecently: Figure;
};

/** Notices on active apps by kind: how many are open (and critical), and where remediation stands. */
export function outstandingRisk(notices: Notice[], today: string): CategoryRisk[] {
  return NOTICE_CATEGORIES.map((category) => {
    const open = inboxRows(notices, {...DEFAULT_INBOX_VIEW, category}, today);
    return {
      category,
      open: noticeFigure(notices, {category}, today),
      critical: noticeFigure(notices, {category, severity: NOTICE_SEVERITY.critical}, today),
      newCount: open.filter((row) => row.match.status === MATCH_STATUS.new).length,
      reviewing: open.filter((row) => row.match.status === MATCH_STATUS.reviewing).length,
      snoozed: noticeFigure(notices, {category, status: INBOX_STATUS.snoozed}, today),
      handledRecently: noticeFigure(notices, {category, status: INBOX_STATUS.handledRecently}, today),
    };
  });
}

export type Accountability = {
  noActiveBackup: NamedLink[];
  ownerLeft: NamedLink[];
  /** Every open notice nobody is assigned to, each linked to the notice (the inbox has no assignee filter). */
  unassigned: NamedLink[];
  byOwner: {owner: string; open: number; apps: number; href: string}[];
};

/**
 * Who is accountable. `activePersonIds` are the people still active (GET /api/people
 * lists only those), so an owner or backup owner not among them is no longer active.
 */
export function accountability(apps: App[], activePersonIds: string[], notices: Notice[], today: string): Accountability {
  const active = new Set(activePersonIds);
  const open = inboxRows(notices, DEFAULT_INBOX_VIEW, today);
  const owners = new Map<string, Accountability['byOwner'][number]>();
  for (const app of apps) {
    const owner = active.has(app.owner.id) ? app.owner.name : `${app.owner.name} (no longer active)`;
    const entry = owners.get(app.owner.id) ?? {owner, open: 0, apps: 0, href: appsHref({owner: app.owner.id})};
    entry.apps += 1;
    entry.open += open.filter((row) => row.match.app.id === app.id).length;
    owners.set(app.owner.id, entry);
  }
  return {
    noActiveBackup: apps.flatMap((app) => {
      if (app.backupOwner === null) {
        return [appLink(app, 'No backup owner')];
      }
      return active.has(app.backupOwner.id) ? [] : [appLink(app, `Backup owner ${app.backupOwner.name} is no longer active`)];
    }),
    ownerLeft: apps.filter((app) => !active.has(app.owner.id)).map((app) => appLink(app, `${app.owner.name} is no longer active`)),
    unassigned: open.filter((row) => row.match.assignee === null).map((row) => matchLink(row.notice, row.match)),
    byOwner: [...owners.values()].sort((a, b) => b.open - a.open || a.owner.localeCompare(b.owner)),
  };
}

export type DatedItem = NamedLink & {date: string};

export type Deadlines = {
  /** Notice deadlines passed in the last 30 days (as on the Overview), and open notices whose date has passed. */
  overdue: DatedItem[];
  /** Open notices back in the queue and not picked up yet: a snooze that ended, or one the source reported again. */
  reopened: NamedLink[];
  /** Dates ahead by window: the first 30 days, then days 31–60, then 61–90. */
  upcoming: {fromDays: number; toDays: number; items: DatedItem[]}[];
};

/** What is late, what came back, and what comes in the next 30, 60 and 90 days: notice deadlines, renewals and open notices' dates. */
export function deadlines(apps: App[], notices: Notice[], today: string): Deadlines {
  const open = inboxRows(notices, DEFAULT_INBOX_VIEW, today);
  const noticeDeadlines: DatedItem[] = apps.flatMap((app) => (app.noticeDeadline ? [{...appLink(app, 'Notice deadline'), date: app.noticeDeadline}] : []));
  const renewals: DatedItem[] = apps.flatMap((app) => (app.renewalDate ? [{...appLink(app, 'Renewal'), date: app.renewalDate}] : []));
  const noticeDates: DatedItem[] = open.flatMap((row) => (row.notice.dueOn ? [{...matchLink(row.notice, row.match), date: row.notice.dueOn}] : []));
  const ahead = [...noticeDeadlines, ...renewals, ...noticeDates];
  const byDate = (a: DatedItem, b: DatedItem) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label);
  const upcoming = GOVERNANCE_UPCOMING_DAYS.map((toDays, index) => {
    const fromDays = index === 0 ? 0 : GOVERNANCE_UPCOMING_DAYS[index - 1] + 1;
    const items = ahead.filter((item) => item.date >= addDaysIso(today, fromDays) && item.date <= addDaysIso(today, toDays)).sort(byDate);
    return {fromDays, toDays, items};
  });
  return {
    overdue: [...noticeDeadlines.filter((item) => isOverdue(item.date, today)), ...noticeDates.filter((item) => item.date < today)].sort(byDate),
    reopened: open.filter((row) => row.match.status === MATCH_STATUS.new && row.match.statusChangedAt !== null).map((row) => matchLink(row.notice, row.match)),
    upcoming,
  };
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const verb = (count: number, one: string, many: string) => (count === 1 ? one : many);
const sentence = (clauses: string[]) => {
  const text = clauses.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
};

/** What the summary reads that is not a figure on the board: how many sources an active app relies on are out of date. */
export type SummaryContext = {staleSources: number};

/**
 * Four or five plain sentences, using the same numbers as the figures below them:
 * notices, health (out of the apps with a score), out-of-date data (only when there is
 * some), dates, ownership. Never says all is well when nothing is registered or checked.
 */
export function executiveSummary(health: PortfolioHealth, risk: CategoryRisk[], people: Accountability, dates: Deadlines, context: SummaryContext): string[] {
  if (health.total === 0) {
    return ['No applications are registered yet.', 'Nothing is being watched, so nothing can be called healthy.', 'Add the first application on Applications to start.'];
  }
  const {figures, coverage} = health;
  const open = risk.reduce((sum, row) => sum + row.open.count, 0);
  const critical = risk.reduce((sum, row) => sum + row.critical.count, 0);
  const attention = figures[APP_HEALTH_FILTER.attention].count;
  const staleApps = figures[APP_HEALTH_FILTER.stale].count;
  const unscored = coverage.total - coverage.checked;
  const [nearest] = dates.upcoming;
  const soon = nearest.items.length;
  const gaps = people.noActiveBackup.length + people.ownerLeft.length;
  const notices =
    open === 0 ? 'No notices are open.' : open === 1 ? `1 notice is open${critical ? ', and it is critical' : ''}.` : `${open} notices are open${critical ? `, ${critical} of them critical` : ''}.`;
  const scores =
    coverage.checked === 0
      ? `None of the ${plural(coverage.total, 'application')} has a health score yet, so none can be called healthy.`
      : sentence([
          `${plural(attention, 'application')} ${verb(attention, 'needs', 'need')} attention out of the ${coverage.checked} with a score`,
          ...(unscored > 0 ? [`${unscored} more ${verb(unscored, 'has', 'have')} no score yet (insufficient data)`] : []),
        ]);
  const outOfDate = [
    ...(staleApps > 0 ? [`${plural(staleApps, 'application')} ${verb(staleApps, 'rests', 'rest')} on out-of-date data`] : []),
    ...(context.staleSources > 0 ? [`${plural(context.staleSources, 'monitoring source')} ${verb(context.staleSources, 'is', 'are')} out of date`] : []),
  ];
  const due = sentence([
    ...(dates.overdue.length > 0 ? [`${plural(dates.overdue.length, 'date')} ${verb(dates.overdue.length, 'has', 'have')} passed with the item still open`] : []),
    soon === 0 ? `nothing falls due in the next ${nearest.toDays} days` : `${plural(soon, 'date')} ${verb(soon, 'falls', 'fall')} due in the next ${nearest.toDays} days`,
  ]);
  const ownership =
    gaps === 0
      ? 'Every application has an active owner and an active backup owner.'
      : `${plural(gaps, 'ownership gap')}: ${people.noActiveBackup.length} without an active backup owner, ${people.ownerLeft.length} whose owner is no longer active.`;
  return [notices, scores, ...(outOfDate.length ? [sentence(outOfDate)] : []), due, ownership];
}
