import {describe, expect, it} from 'vitest';
import {APP_HEALTH_FILTER, HEALTH_STATUS, MATCH_STATUS, NOTICE_CATEGORY, NOTICE_SEVERITY} from '@/lib/constants';
import type {App, Notice} from './api-client';
import {accountability, deadlines, executiveSummary, openBySeverity, outstandingRisk, portfolioHealth} from './governance';

const TODAY = '2026-11-28';

const app = (name: string, extra: Partial<App> = {}): App =>
  ({
    id: `${name}-id`,
    name,
    owner: {id: 'ada', name: 'Ada Owner'},
    backupOwner: {id: 'ben', name: 'Ben Backup'},
    noticeDeadline: null,
    renewalDate: null,
    health: {score: 100, status: HEALTH_STATUS.ok, staleSince: null},
    ...extra,
  }) as unknown as App;

const health = (score: number | null, status: string, staleSince: string | null = null) => ({health: {score, status, staleSince} as App['health']});

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

describe('governance board', () => {
  it('AC2: apps by health (critical and out-of-date among those needing attention; insufficient data never healthy) and coverage, each figure linking to the Applications filter that shows it', () => {
    const apps = [
      app('Fine'),
      app('Worried', health(88, HEALTH_STATUS.attention)),
      app('Broken', health(40, HEALTH_STATUS.critical)),
      app('Old data', health(100, HEALTH_STATUS.stale, '2026-11-20T06:00:00Z')),
      app('Unchecked', health(null, HEALTH_STATUS.na)),
      app('Broken and old', health(40, HEALTH_STATUS.critical, '2026-11-20T06:00:00Z')),
    ];
    const result = portfolioHealth(apps);
    expect(Object.fromEntries(Object.entries(result.figures).map(([filter, figure]) => [filter, figure.count]))).toEqual({
      [APP_HEALTH_FILTER.attention]: 4,
      [APP_HEALTH_FILTER.critical]: 2,
      [APP_HEALTH_FILTER.stale]: 2,
      [APP_HEALTH_FILTER.notMonitored]: 1,
      [APP_HEALTH_FILTER.healthy]: 1,
    });
    expect(result.coverage).toEqual({checked: 5, total: 6});
    expect(result.figures.not_monitored.href).toBe('/applications?health=not_monitored');
    expect(result.figures.critical.href).toBe('/applications?health=critical');
  });

  it('AC3: open notices by severity and by kind, and remediation (new, reviewing, snoozed, handled in 30 days); each drills down', () => {
    const notices = [
      notice('CVE A', NOTICE_CATEGORY.security, NOTICE_SEVERITY.critical, 'Portal'),
      notice('CVE B', NOTICE_CATEGORY.security, NOTICE_SEVERITY.high, 'Portal', {status: MATCH_STATUS.reviewing}),
      notice('CVE C', NOTICE_CATEGORY.security, NOTICE_SEVERITY.high, 'Portal', {status: MATCH_STATUS.snoozed, snoozedUntil: '2099-01-01'}),
      notice('CVE D', NOTICE_CATEGORY.security, NOTICE_SEVERITY.low, 'Portal', {status: MATCH_STATUS.handled, statusChangedAt: '2026-11-20T09:00:00Z'}),
      notice('CVE E', NOTICE_CATEGORY.security, NOTICE_SEVERITY.low, 'Portal', {status: MATCH_STATUS.handled, statusChangedAt: '2026-09-01T09:00:00Z'}),
    ];
    const security = outstandingRisk(notices, TODAY).find((row) => row.category === NOTICE_CATEGORY.security)!;
    expect(security).toMatchObject({open: {count: 2}, critical: {count: 1}, newCount: 1, reviewing: 1, snoozed: {count: 1}, handledRecently: {count: 1}});
    expect(security.open.href).toBe('/notices?category=security');
    expect(security.critical.href).toBe('/notices?severity=critical&category=security');
    expect(security.handledRecently.href).toBe('/notices?status=handled_recently&category=security');
    expect(Object.fromEntries(openBySeverity(notices, TODAY).map((row) => [row.severity, row.open.count]))).toEqual({critical: 1, high: 1, medium: 0, low: 0, unknown: 0});
    expect(openBySeverity(notices, TODAY)[0].open.href).toBe('/notices?severity=critical');
  });

  it('AC4: apps with no active backup owner or an owner no longer active (not among the active people), unassigned open notices, and each owner\'s open items', () => {
    const apps = [app('Solo', {backupOwner: null}), app('Orphan', {owner: {id: 'gone', name: 'Casey Gone'}}), app('Backup left', {backupOwner: {id: 'gone', name: 'Casey Gone'}})];
    const notices = [notice('CVE A', NOTICE_CATEGORY.security, NOTICE_SEVERITY.high, 'Solo'), notice('CVE B', NOTICE_CATEGORY.security, NOTICE_SEVERITY.high, 'Solo', {assignee: {id: 'ada', name: 'Ada'}})];
    const result = accountability(apps, ['ada', 'ben'], notices, TODAY);
    expect(result.noActiveBackup.map((row) => [row.label, row.detail])).toEqual([
      ['Solo', 'No backup owner'],
      ['Backup left', 'Backup owner Casey Gone is no longer active'],
    ]);
    expect(result.ownerLeft.map((row) => row.label)).toEqual(['Orphan']);
    expect(result.unassigned.map((row) => row.label)).toEqual(['CVE A']);
    expect(result.byOwner).toEqual([
      {owner: 'Ada Owner', open: 2, apps: 2, href: '/applications?owner=ada'},
      {owner: 'Casey Gone (no longer active)', open: 0, apps: 1, href: '/applications?owner=gone'},
    ]);
  });

  it('AC5: overdue notice deadlines and open notices past their date; notices back in the queue (a snooze ended); upcoming dates in 30, 31–60 and 61–90 days, each in one window', () => {
    const apps = [
      app('Lapsed', {noticeDeadline: '2026-11-20'}),
      app('Soon', {noticeDeadline: '2026-12-10', renewalDate: '2027-01-15'}),
      app('Later', {renewalDate: '2027-02-20'}),
    ];
    const notices = [
      // The API reads a snooze whose date has come as new again, with the time it was snoozed.
      notice('Back from snooze', NOTICE_CATEGORY.security, NOTICE_SEVERITY.high, 'Soon', {status: MATCH_STATUS.new, statusChangedAt: '2026-11-01T09:00:00Z'}),
      notice('Node 18 end of support', NOTICE_CATEGORY.lifecycle, NOTICE_SEVERITY.high, 'Soon', {}, {dueOn: '2026-11-25'}),
    ];
    const result = deadlines(apps, notices, TODAY);
    expect(result.overdue.map((row) => [row.label, row.detail])).toEqual([
      ['Lapsed', 'Notice deadline'],
      ['Node 18 end of support', 'Soon'],
    ]);
    expect(result.reopened.map((row) => row.label)).toEqual(['Back from snooze']);
    expect(result.upcoming.map((window) => [window.fromDays, window.toDays, window.items.map((row) => `${row.label} ${row.detail}`)])).toEqual([
      [0, 30, ['Soon Notice deadline']],
      [31, 60, ['Soon Renewal']],
      [61, 90, ['Later Renewal']],
    ]);
  });

  it('AC6: the executive summary states the same numbers as the figures, in three to five sentences, most urgent first; an empty or unchecked portfolio never reads as all clear', () => {
    const apps = [
      app('Broken', health(40, HEALTH_STATUS.critical)),
      app('Old data', health(100, HEALTH_STATUS.stale, '2026-11-20T06:00:00Z')),
      app('Lapsed', {noticeDeadline: '2026-11-20', backupOwner: null}),
      app('Unchecked', health(null, HEALTH_STATUS.na)),
    ];
    const notices = [notice('CVE A', NOTICE_CATEGORY.security, NOTICE_SEVERITY.critical, 'Broken'), notice('CVE B', NOTICE_CATEGORY.lifecycle, NOTICE_SEVERITY.high, 'Broken')];
    const board = portfolioHealth(apps);
    const summary = executiveSummary(board, outstandingRisk(notices, TODAY), accountability(apps, ACTIVE, notices, TODAY), deadlines(apps, notices, TODAY), {staleSources: 1});
    expect(board.figures.attention.count).toBe(2);
    expect(summary).toEqual([
      '2 notices are open, 1 of them critical.',
      '2 applications need attention out of the 3 with a score; 1 more has no score yet (insufficient data).',
      '1 application rests on out-of-date data; 1 monitoring source is out of date.',
      '1 date has passed with the item still open; nothing falls due in the next 30 days.',
      '1 ownership gap: 1 without an active backup owner, 0 whose owner is no longer active.',
    ]);
    const calm = [app('Fine', {renewalDate: '2026-12-05'})];
    const one = [notice('CVE', NOTICE_CATEGORY.security, NOTICE_SEVERITY.critical, 'Fine')];
    expect(executiveSummary(portfolioHealth(calm), outstandingRisk(one, TODAY), accountability(calm, ACTIVE, one, TODAY), deadlines(calm, one, TODAY), NO_SOURCES)).toEqual([
      '1 notice is open, and it is critical.',
      '0 applications need attention out of the 1 with a score.',
      '1 date falls due in the next 30 days.',
      'Every application has an active owner and an active backup owner.',
    ]);
    const unchecked = [app('A', health(null, HEALTH_STATUS.na)), app('B', health(null, HEALTH_STATUS.na))];
    expect(executiveSummary(portfolioHealth(unchecked), [], accountability(unchecked, ACTIVE, [], TODAY), deadlines(unchecked, [], TODAY), NO_SOURCES)[0 + 1]).toBe(
      'None of the 2 applications has a health score yet, so none can be called healthy.',
    );
    expect(executiveSummary(portfolioHealth([]), [], accountability([], ACTIVE, [], TODAY), deadlines([], [], TODAY), NO_SOURCES)).toEqual([
      'No applications are registered yet.',
      'Nothing is being watched, so nothing can be called healthy.',
      'Add the first application on Applications to start.',
    ]);
  });
});
