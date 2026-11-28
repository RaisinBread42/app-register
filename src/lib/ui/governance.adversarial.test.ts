/**
 * Adversarial tests for [49] Governance Board. Each test states the rule it holds the board to;
 * a failing test is a defect. The drill-down tests follow a figure's href into the very helpers
 * the Applications and Notices pages use (appListViewFrom + applyAppListView, inboxViewFrom + inboxRows),
 * so "the figure says N, the linked list shows M" is measured, not argued.
 */
import {describe, expect, it} from 'vitest';
import {HEALTH_STATUS, MATCH_STATUS, NOTICE_CATEGORY, NOTICE_SEVERITY} from '@/lib/constants';
import type {App, Notice} from './api-client';
import {applyAppListView, topIssues} from './catalog';
import {accountability, deadlines, executiveSummary, outstandingRisk, portfolioHealth} from './governance';
import {appListViewFrom} from './list-filters';
import {inboxRows, inboxViewFrom} from './notice-inbox';

const TODAY = '2026-11-28';

const app = (name: string, extra: Partial<App> = {}): App =>
  ({
    id: `${name}-id`,
    name,
    kind: 'saas',
    criticality: null,
    owner: {id: 'ada', name: 'Ada Owner'},
    backupOwner: {id: 'ben', name: 'Ben Backup'},
    noticeDeadline: null,
    renewalDate: null,
    health: {score: 100, status: HEALTH_STATUS.ok, staleSince: null, hasFailedCheck: false},
    ...extra,
  }) as unknown as App;

const health = (score: number | null, status: string, staleSince: string | null = null) => ({health: {score, status, staleSince, hasFailedCheck: staleSince !== null} as App['health']});

const notice = (title: string, category: string, severity: string, appName: string, match: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Notice =>
  ({
    id: title,
    title,
    category,
    severity,
    dueOn: null,
    lastSeenAt: '2026-11-28T09:00:00Z',
    matches: [{id: `${title}-m`, app: {id: `${appName}-id`, name: appName}, status: MATCH_STATUS.new, resolvedAt: null, assignee: null, snoozedUntil: null, statusChangedAt: null, ...match}],
    ...extra,
  }) as unknown as Notice;

const ACTIVE = ['ada', 'ben'];
const NO_SOURCES = {staleSources: 0};

/** What the Applications page shows for a board href. */
const appsShown = (href: string, apps: App[], notices: Notice[]) => {
  const url = new URL(href, 'http://board.test');
  return applyAppListView(apps, appListViewFrom(Object.fromEntries(url.searchParams)), topIssues(notices), TODAY);
};
/** What the Notices page shows for a board href. */
const noticesShown = (href: string, notices: Notice[]) => {
  const url = new URL(href, 'http://board.test');
  return inboxRows(notices, inboxViewFrom(Object.fromEntries(url.searchParams)));
};

const MIXED_APPS = [
  app('Fine'),
  app('Worried', health(88, HEALTH_STATUS.attention)),
  app('Broken', health(40, HEALTH_STATUS.critical)),
  app('Old data', health(100, HEALTH_STATUS.stale, '2026-11-20T06:00:00Z')),
  app('Broken and old', health(40, HEALTH_STATUS.critical, '2026-11-20T06:00:00Z')),
  app('Unchecked', health(null, HEALTH_STATUS.na)),
];

describe('ADV [49] drill-down: a figure and the list it links to agree (AC7)', () => {
  it('ADV-U1 each portfolio health figure links to a list holding exactly that many applications', () => {
    const board = portfolioHealth(MIXED_APPS);
    const mismatches = Object.entries(board.figures).map(([state, figure]) => ({state, figure: figure.count, listShows: appsShown(figure.href, MIXED_APPS, []).length, href: figure.href}));
    for (const row of mismatches) {
      expect(row.listShows, `${row.state}: board says ${row.figure}, ${row.href} shows ${row.listShows}`).toBe(row.figure);
    }
  });

  it('ADV-U2 "Handled (30 days)" links to a list of the handled-in-30-days notices, not every handled one', () => {
    const notices = [
      notice('Recent fix', NOTICE_CATEGORY.security, NOTICE_SEVERITY.low, 'Portal', {status: MATCH_STATUS.handled, statusChangedAt: '2026-11-20T09:00:00Z'}),
      notice('Fixed in spring', NOTICE_CATEGORY.security, NOTICE_SEVERITY.low, 'Portal', {status: MATCH_STATUS.handled, statusChangedAt: '2026-03-01T09:00:00Z'}),
      notice('Fixed last year', NOTICE_CATEGORY.security, NOTICE_SEVERITY.low, 'Portal', {status: MATCH_STATUS.handled, statusChangedAt: '2025-06-01T09:00:00Z'}),
    ];
    const security = outstandingRisk(notices, TODAY).find((row) => row.category === NOTICE_CATEGORY.security)!;
    const shown = noticesShown(security.handledRecently.href, notices).length;
    expect(shown, `board says ${security.handledRecently.count}, ${security.handledRecently.href} shows ${shown}`).toBe(security.handledRecently.count);
  });

  it('ADV-U3 "Open notices with no owner" lists exactly the unassigned notices, each linked to it, never every open notice', () => {
    const notices = [
      notice('Nobody owns this', NOTICE_CATEGORY.security, NOTICE_SEVERITY.high, 'Portal'),
      notice('Ada has it', NOTICE_CATEGORY.security, NOTICE_SEVERITY.high, 'Portal', {assignee: {id: 'ada', name: 'Ada Owner'}}),
      notice('Ben has it', NOTICE_CATEGORY.outage, NOTICE_SEVERITY.medium, 'Portal', {assignee: {id: 'ben', name: 'Ben Backup'}}),
    ];
    const {unassigned} = accountability([app('Portal')], ACTIVE, notices, TODAY);
    // The inbox has no assignee filter, so the board lists every unassigned notice itself, each linked to it.
    expect(unassigned.map((row) => row.label)).toEqual(['Nobody owns this']);
    expect(noticesShown(unassigned[0].href, notices).map((row) => row.notice.title)).toContain('Nobody owns this');
  });
});

describe('ADV [49] the executive summary matches the figures (AC6)', () => {
  it('ADV-U4 the summary\'s "out-of-date data" count equals the "Data out of date" figure on the board', () => {
    const board = portfolioHealth(MIXED_APPS);
    const summary = executiveSummary(board, outstandingRisk([], TODAY), accountability(MIXED_APPS, ACTIVE, [], TODAY), deadlines(MIXED_APPS, [], TODAY), NO_SOURCES);
    const said = summary.find((line) => /out-of-date data/.test(line));
    expect(said).toMatch(new RegExp(`^${board.figures.stale.count} application`));
  });

  it('ADV-U5 the summary\'s "need attention" count equals the "Need attention" figure on the board', () => {
    const board = portfolioHealth(MIXED_APPS);
    const summary = executiveSummary(board, outstandingRisk([], TODAY), accountability(MIXED_APPS, ACTIVE, [], TODAY), deadlines(MIXED_APPS, [], TODAY), NO_SOURCES);
    const said = summary.find((line) => /attention/.test(line))!;
    expect(said).toMatch(new RegExp(`^${board.figures.attention.count} application`));
  });

  it('ADV-U6 a portfolio nothing has checked never reads "0 applications need attention" (unknown is not healthy)', () => {
    const apps = [app('A', health(null, HEALTH_STATUS.na)), app('B', health(null, HEALTH_STATUS.na)), app('C', health(null, HEALTH_STATUS.na))];
    const summary = executiveSummary(portfolioHealth(apps), outstandingRisk([], TODAY), accountability(apps, ACTIVE, [], TODAY), deadlines(apps, [], TODAY), NO_SOURCES);
    expect(summary.filter((line) => line.startsWith('0 applications need attention')), 'nothing checked, yet the summary says none need attention').toEqual([]);
  });

  it('ADV-U7 one open critical notice reads in the singular, and several stale apps read in the plural', () => {
    const apps = [app('Old 1', health(100, HEALTH_STATUS.stale, '2026-11-20T06:00:00Z')), app('Old 2', health(100, HEALTH_STATUS.stale, '2026-11-20T06:00:00Z'))];
    const notices = [notice('CVE', NOTICE_CATEGORY.security, NOTICE_SEVERITY.critical, 'Old 1')];
    const summary = executiveSummary(portfolioHealth(apps), outstandingRisk(notices, TODAY), accountability(apps, ACTIVE, notices, TODAY), deadlines(apps, notices, TODAY), NO_SOURCES);
    expect(summary[0]).not.toMatch(/1 notice is open, 1 of them critical/);
    expect(summary.join(' ')).toMatch(/2 applications rest on out-of-date data/);
  });

  it('ADV-U8 an app whose backup owner has left is not reported as "Every application has an active owner and a backup owner"', () => {
    const apps = [app('Portal', {backupOwner: {id: 'gone', name: 'Casey Gone'}})];
    const summary = executiveSummary(portfolioHealth(apps), outstandingRisk([], TODAY), accountability(apps, ['ada'], [], TODAY), deadlines(apps, [], TODAY), NO_SOURCES);
    expect(summary.at(-1)).not.toBe('Every application has an active owner and a backup owner.');
  });

  it('ADV-U9 the empty-portfolio summary still has 3–5 sentences (AC6)', () => {
    const summary = executiveSummary(portfolioHealth([]), [], accountability([], ACTIVE, [], TODAY), deadlines([], [], TODAY), NO_SOURCES);
    expect(summary.length).toBeGreaterThanOrEqual(3);
  });
});

describe('ADV [49] overdue and upcoming (AC5)', () => {
  it('ADV-U10 an open end-of-support notice whose date has passed counts as overdue; one due in 20 days as upcoming', () => {
    const apps = [app('Portal')];
    const notices = [
      notice('Node 18 end of support', NOTICE_CATEGORY.lifecycle, NOTICE_SEVERITY.high, 'Portal', {}, {dueOn: '2026-11-20'}),
      notice('Postgres 13 end of support', NOTICE_CATEGORY.lifecycle, NOTICE_SEVERITY.high, 'Portal', {}, {dueOn: '2026-12-18'}),
    ];
    const result = deadlines(apps, notices, TODAY);
    expect(result.overdue.map((row) => row.label), 'a passed support date on an open notice is overdue').toEqual(['Node 18 end of support']);
    expect(result.upcoming[0].items.length, 'a support date in 20 days is upcoming').toBeGreaterThan(0);
  });
});
