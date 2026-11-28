import {
  APP_HEALTH_FILTER,
  DATE_KIND,
  GOVERNANCE_HANDLED_DAYS,
  GOVERNANCE_UPCOMING_DAYS,
  BOARD_HEALTH_STATE as HEALTH_STATE,
  HEALTH_STATUS,
  type BoardHealthState as HealthState,
  MATCH_STATUS,
  OVERVIEW_OVERDUE_DAYS,
  NOTICE_CATEGORIES,
  NOTICE_SEVERITIES,
  NOTICE_SEVERITY,
  PERSON_STATUS,
  ROUTES,
  type DateKind,
  type NoticeCategory,
  type NoticeSeverity,
} from '@/lib/constants';
import {addDaysIso} from '@/lib/notice-alerts';
import type {App, Notice, NoticeMatch, Person} from './api-client';
import {appListQuery} from './list-filters';
import {DEFAULT_APP_LIST_VIEW} from './catalog';
import {DEFAULT_INBOX_VIEW, INBOX_STATUS, inboxQuery, inboxRows} from './notice-inbox';
import {isOverdue} from './overview';

/**
 * The Governance Board's figures ([49], spec governance-board.md): a light reporting
 * layer over data the register already holds. Nothing here is monitored or entered;
 * every figure is worked out from apps, notices, people and their dates, and carries
 * the link to the existing list that shows the items behind it. Pure, so each figure
 * is tested without a page.
 */

/** A number with the list it drills down to. */
export type Figure = {count: number; href: string};

const appsHref = (view: Partial<typeof DEFAULT_APP_LIST_VIEW>) => `${ROUTES.applications}${appListQuery({...DEFAULT_APP_LIST_VIEW, ...view})}`;
const noticesHref = (view: Partial<typeof DEFAULT_INBOX_VIEW>) => `${ROUTES.notices}${inboxQuery({...DEFAULT_INBOX_VIEW, ...view})}`;

/**
 * One app's state on the board: a score's status, or insufficient data when nothing
 * could check it. A clean reading whose source then failed is stale; a critical or
 * attention one keeps that state (and counts in `outOfDate` too).
 */
export function healthState(app: App): HealthState {
  if (app.health.score === null) return HEALTH_STATE.insufficient;
  if (app.health.status === HEALTH_STATUS.stale) return HEALTH_STATE.stale;
  if (app.health.status === HEALTH_STATUS.critical) return HEALTH_STATE.critical;
  if (app.health.status === HEALTH_STATUS.attention) return HEALTH_STATE.attention;
  return HEALTH_STATE.healthy;
}

export type PortfolioHealth = {
  total: number;
  byState: Record<HealthState, Figure>;
  coverage: {checked: number; total: number};
  /** Apps whose score rests on a reading a later check could not refresh, whatever their state. */
  outOfDate: number;
};

/** Apps by health state, and how many something has checked (coverage). */
export function portfolioHealth(apps: App[]): PortfolioHealth {
  const count = (state: HealthState) => apps.filter((app) => healthState(app) === state).length;
  return {
    total: apps.length,
    byState: {
      [HEALTH_STATE.healthy]: {count: count(HEALTH_STATE.healthy), href: appsHref({health: APP_HEALTH_FILTER.healthy})},
      [HEALTH_STATE.attention]: {count: count(HEALTH_STATE.attention), href: appsHref({health: APP_HEALTH_FILTER.attention})},
      [HEALTH_STATE.critical]: {count: count(HEALTH_STATE.critical), href: appsHref({health: APP_HEALTH_FILTER.attention})},
      [HEALTH_STATE.stale]: {count: count(HEALTH_STATE.stale), href: appsHref({health: APP_HEALTH_FILTER.attention})},
      [HEALTH_STATE.insufficient]: {count: count(HEALTH_STATE.insufficient), href: appsHref({health: APP_HEALTH_FILTER.notMonitored})},
    },
    coverage: {checked: apps.length - count(HEALTH_STATE.insufficient), total: apps.length},
    outOfDate: apps.filter((app) => app.health.staleSince !== null).length,
  };
}

export type CategoryRisk = {
  category: NoticeCategory;
  open: Figure;
  critical: Figure;
  /** Remediation: open ones split by status, snoozed, and handled in the last GOVERNANCE_HANDLED_DAYS days. */
  newCount: number;
  reviewing: number;
  snoozed: Figure;
  handledRecently: Figure;
};

/** Open notices on active apps by severity, most severe first; each links to the inbox filtered to it. */
export function openBySeverity(notices: Notice[]): {severity: NoticeSeverity; open: Figure}[] {
  const open = inboxRows(notices, DEFAULT_INBOX_VIEW);
  return NOTICE_SEVERITIES.map((severity) => ({
    severity,
    open: {count: open.filter((row) => row.notice.severity === severity).length, href: noticesHref({severity})},
  }));
}

/** Notices on active apps by kind: how many are open (and critical), and where remediation stands. */
export function outstandingRisk(notices: Notice[], today: string): CategoryRisk[] {
  const all = inboxRows(notices, {...DEFAULT_INBOX_VIEW, status: INBOX_STATUS.all});
  const since = addDaysIso(today, -GOVERNANCE_HANDLED_DAYS);
  return NOTICE_CATEGORIES.map((category) => {
    const rows = all.filter((row) => row.notice.category === category);
    const open = rows.filter((row) => row.match.status === MATCH_STATUS.new || row.match.status === MATCH_STATUS.reviewing);
    return {
      category,
      open: {count: open.length, href: noticesHref({category})},
      critical: {count: open.filter((row) => row.notice.severity === NOTICE_SEVERITY.critical).length, href: noticesHref({category, severity: NOTICE_SEVERITY.critical})},
      newCount: open.filter((row) => row.match.status === MATCH_STATUS.new).length,
      reviewing: open.filter((row) => row.match.status === MATCH_STATUS.reviewing).length,
      snoozed: {count: rows.filter((row) => row.match.status === MATCH_STATUS.snoozed).length, href: noticesHref({category, status: INBOX_STATUS.snoozed})},
      handledRecently: {
        count: rows.filter((row) => row.match.status === MATCH_STATUS.handled && (row.match.statusChangedAt ?? '').slice(0, 10) >= since).length,
        href: noticesHref({category, status: INBOX_STATUS.handled}),
      },
    };
  });
}

export type NamedLink = {label: string; detail: string; href: string};

export type Accountability = {
  noBackupOwner: NamedLink[];
  ownerLeft: NamedLink[];
  unassigned: Figure & {items: NamedLink[]};
  byOwner: {owner: string; open: number; apps: number; href: string}[];
};

const appLink = (app: Pick<App, 'id' | 'name'>, detail: string): NamedLink => ({label: app.name, detail, href: `${ROUTES.applications}/${encodeURIComponent(app.id)}`});
const matchLink = (notice: Notice, match: NoticeMatch): NamedLink => ({label: notice.title, detail: match.app.name, href: noticesHref({notice: match.id})});

/** Who is accountable: apps with no backup owner or a departed owner, open notices nobody owns, and each owner's open items. */
export function accountability(apps: App[], people: Person[], notices: Notice[]): Accountability {
  const left = new Set(people.filter((person) => person.status !== PERSON_STATUS.active).map((person) => person.id));
  const open = inboxRows(notices, DEFAULT_INBOX_VIEW);
  const unassigned = open.filter((row) => row.match.assignee === null);
  const owners = new Map<string, Accountability['byOwner'][number]>();
  for (const app of apps) {
    const entry = owners.get(app.owner.id) ?? {owner: app.owner.name, open: 0, apps: 0, href: appsHref({owner: app.owner.id})};
    entry.apps += 1;
    entry.open += open.filter((row) => row.match.app.id === app.id).length;
    owners.set(app.owner.id, entry);
  }
  return {
    noBackupOwner: apps.filter((app) => app.backupOwner === null).map((app) => appLink(app, `Owner: ${app.owner.name}`)),
    ownerLeft: apps.filter((app) => left.has(app.owner.id)).map((app) => appLink(app, `${app.owner.name} has left`)),
    unassigned: {count: unassigned.length, href: noticesHref({}), items: unassigned.map((row) => matchLink(row.notice, row.match))},
    byOwner: [...owners.values()].sort((a, b) => b.open - a.open || a.owner.localeCompare(b.owner)),
  };
}

export type DatedItem = {appId: string; label: string; date: string; kind: DateKind; href: string};

export type Deadlines = {
  overdue: DatedItem[];
  snoozesEnded: NamedLink[];
  /** Notice deadlines and renewals ahead, by window (30, 60, 90 days); each date counts in the first window it falls in. */
  upcoming: {days: number; items: DatedItem[]}[];
};

/** What is late (passed notice deadlines with no decision recorded, snoozes past their end) and what comes in 30, 60 and 90 days. */
export function deadlines(apps: App[], notices: Notice[], today: string): Deadlines {
  const dated: DatedItem[] = apps.flatMap((app) => [
    ...(app.noticeDeadline ? [{appId: app.id, label: `${app.name} notice deadline`, date: app.noticeDeadline, kind: DATE_KIND.notice, href: `${ROUTES.applications}/${encodeURIComponent(app.id)}`}] : []),
    ...(app.renewalDate ? [{appId: app.id, label: `${app.name} renewal`, date: app.renewalDate, kind: DATE_KIND.renewal, href: `${ROUTES.applications}/${encodeURIComponent(app.id)}`}] : []),
  ]);
  const snoozed = inboxRows(notices, {...DEFAULT_INBOX_VIEW, status: INBOX_STATUS.snoozed});
  let from = today;
  const upcoming = GOVERNANCE_UPCOMING_DAYS.map((days) => {
    const until = addDaysIso(today, days);
    const items = dated.filter((item) => item.date >= from && item.date <= until).sort((a, b) => a.date.localeCompare(b.date));
    from = addDaysIso(until, 1);
    return {days, items};
  });
  return {
    overdue: dated.filter((item) => item.kind === DATE_KIND.notice && isOverdue(item.date, today)).sort((a, b) => a.date.localeCompare(b.date)),
    snoozesEnded: snoozed.filter((row) => row.match.snoozedUntil !== null && row.match.snoozedUntil <= today).map((row) => matchLink(row.notice, row.match)),
    upcoming,
  };
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const verb = (count: number, one: string, many: string) => (count === 1 ? one : many);
const sentence = (clauses: string[]) => {
  const text = clauses.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
};

/**
 * Four or five plain sentences from the figures, most urgent first: notices, health,
 * out-of-date data (only when there is some), dates, ownership. Never says "all is well"
 * when nothing is registered.
 */
export function executiveSummary(health: PortfolioHealth, risk: CategoryRisk[], people: Accountability, dates: Deadlines): string[] {
  if (health.total === 0) {
    return ['No applications are registered yet, so nothing is being watched.'];
  }
  const open = risk.reduce((sum, row) => sum + row.open.count, 0);
  const critical = risk.reduce((sum, row) => sum + row.critical.count, 0);
  const affected = health.byState.critical.count + health.byState.attention.count;
  const stale = health.outOfDate;
  const [nearest] = dates.upcoming;
  const soon = nearest.items.length;
  const gaps = people.noBackupOwner.length + people.ownerLeft.length;
  return [
    open === 0 ? 'No notices are open.' : `${plural(open, 'notice')} ${verb(open, 'is', 'are')} open${critical ? `, ${critical} of them critical` : ''}.`,
    `${plural(affected, 'application')} ${verb(affected, 'needs', 'need')} attention out of ${health.total}; ${health.coverage.checked} of ${health.total} ${verb(health.coverage.checked, 'has', 'have')} been checked.`,
    ...(stale > 0 ? [`${plural(stale, 'application')} ${verb(stale, 'has', 'have')} out-of-date data, so ${verb(stale, 'its', 'their')} score may be wrong.`] : []),
    sentence([
      ...(dates.overdue.length > 0 ? [`${plural(dates.overdue.length, 'notice deadline')} ${verb(dates.overdue.length, 'has', 'have')} passed in the last ${OVERVIEW_OVERDUE_DAYS} days`] : []),
      soon === 0
        ? `no deadline or renewal falls in the next ${nearest.days} days`
        : `${plural(soon, 'deadline or renewal', 'deadlines or renewals')} ${verb(soon, 'falls', 'fall')} in the next ${nearest.days} days`,
    ]),
    gaps === 0
      ? 'Every application has an active owner and a backup owner.'
      : `${plural(gaps, 'ownership gap')}: ${people.noBackupOwner.length} with no backup owner, ${people.ownerLeft.length} whose owner has left.`,
  ];
}
