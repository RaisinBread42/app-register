import {describe, expect, it} from 'vitest';
import {BOARD_HEALTH_STATE, HEALTH_STATUS, MATCH_STATUS, NOTICE_CATEGORY, NOTICE_SEVERITY, PERSON_STATUS} from '@/lib/constants';
import type {App, Notice, Person} from './api-client';
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

const notice = (title: string, category: string, severity: string, appName: string, match: Record<string, unknown> = {}): Notice =>
  ({
    id: title,
    title,
    category,
    severity,
    dueOn: null,
    lastSeenAt: '2026-11-28T09:00:00Z',
    matches: [{id: `${title}-m`, app: {id: `${appName}-id`, name: appName}, status: MATCH_STATUS.new, resolvedAt: null, assignee: null, snoozedUntil: null, statusChangedAt: null, ...match}],
  }) as unknown as Notice;

const person = (id: string, status: string): Person => ({id, name: id, email: `${id}@example.test`, status}) as Person;

describe('governance board', () => {
  it('AC2: apps by health state (stale and insufficient data apart, never counted healthy) and portfolio coverage', () => {
    const apps = [
      app('Fine'),
      app('Worried', health(88, HEALTH_STATUS.attention)),
      app('Broken', health(40, HEALTH_STATUS.critical)),
      app('Old data', health(100, HEALTH_STATUS.stale, '2026-11-20T06:00:00Z')),
      app('Unchecked', health(null, HEALTH_STATUS.na)),
      app('Broken and old', health(40, HEALTH_STATUS.critical, '2026-11-20T06:00:00Z')),
    ];
    const result = portfolioHealth(apps);
    expect(Object.fromEntries(Object.entries(result.byState).map(([state, figure]) => [state, figure.count]))).toEqual({
      [BOARD_HEALTH_STATE.healthy]: 1,
      [BOARD_HEALTH_STATE.attention]: 1,
      [BOARD_HEALTH_STATE.critical]: 2,
      [BOARD_HEALTH_STATE.stale]: 1,
      [BOARD_HEALTH_STATE.insufficient]: 1,
    });
    expect(result.coverage).toEqual({checked: 5, total: 6});
    expect(result.outOfDate, 'a critical app on out-of-date data stays critical and is still counted as out of date').toBe(2);
    expect(result.byState.insufficient.href).toBe('/applications?health=not_monitored');
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
    expect(Object.fromEntries(openBySeverity(notices).map((row) => [row.severity, row.open.count]))).toEqual({critical: 1, high: 1, medium: 0, low: 0, unknown: 0});
    expect(openBySeverity(notices)[0].open.href).toBe('/notices?severity=critical');
  });

  it('AC4: apps with no backup owner or a departed owner, unassigned open notices, and each owner\'s open items', () => {
    const apps = [app('Solo', {backupOwner: null}), app('Orphan', {owner: {id: 'gone', name: 'Casey Gone'}})];
    const people = [person('ada', PERSON_STATUS.active), person('gone', PERSON_STATUS.left)];
    const notices = [notice('CVE A', NOTICE_CATEGORY.security, NOTICE_SEVERITY.high, 'Solo'), notice('CVE B', NOTICE_CATEGORY.security, NOTICE_SEVERITY.high, 'Solo', {assignee: {id: 'ada', name: 'Ada'}})];
    const result = accountability(apps, people, notices);
    expect(result.noBackupOwner.map((row) => row.label)).toEqual(['Solo']);
    expect(result.ownerLeft.map((row) => row.label)).toEqual(['Orphan']);
    expect(result.unassigned.count).toBe(1);
    expect(result.byOwner).toEqual([
      {owner: 'Ada Owner', open: 2, apps: 1, href: '/applications?owner=ada'},
      {owner: 'Casey Gone', open: 0, apps: 1, href: '/applications?owner=gone'},
    ]);
  });

  it('AC5: overdue notice deadlines and ended snoozes; upcoming dates in 30, 60 and 90 days, each in one window', () => {
    const apps = [
      app('Lapsed', {noticeDeadline: '2026-11-20'}),
      app('Soon', {noticeDeadline: '2026-12-10', renewalDate: '2027-01-15'}),
      app('Later', {renewalDate: '2027-02-20'}),
    ];
    const notices = [notice('Snoozed past', NOTICE_CATEGORY.security, NOTICE_SEVERITY.high, 'Soon', {status: MATCH_STATUS.snoozed, snoozedUntil: '2026-11-27'})];
    const result = deadlines(apps, notices, TODAY);
    expect(result.overdue.map((row) => row.label)).toEqual(['Lapsed notice deadline']);
    expect(result.snoozesEnded.map((row) => row.label)).toEqual(['Snoozed past']);
    expect(result.upcoming.map((window) => [window.days, window.items.map((row) => row.label)])).toEqual([
      [30, ['Soon notice deadline']],
      [60, ['Soon renewal']],
      [90, ['Later renewal']],
    ]);
  });

  it('AC6: the executive summary states the numbers above in four or five sentences, most urgent first, and an empty portfolio never reads as all clear', () => {
    const apps = [app('Broken', health(40, HEALTH_STATUS.critical)), app('Old data', health(100, HEALTH_STATUS.stale, '2026-11-20T06:00:00Z')), app('Lapsed', {noticeDeadline: '2026-11-20', backupOwner: null})];
    const notices = [notice('CVE A', NOTICE_CATEGORY.security, NOTICE_SEVERITY.critical, 'Broken'), notice('CVE B', NOTICE_CATEGORY.lifecycle, NOTICE_SEVERITY.high, 'Broken')];
    const summary = executiveSummary(portfolioHealth(apps), outstandingRisk(notices, TODAY), accountability(apps, [], notices), deadlines(apps, notices, TODAY));
    expect(summary).toEqual([
      '2 notices are open, 1 of them critical.',
      '1 application needs attention out of 3; 3 of 3 have been checked.',
      '1 application has out-of-date data, so its score may be wrong.',
      '1 notice deadline has passed in the last 30 days; no deadline or renewal falls in the next 30 days.',
      '1 ownership gap: 1 with no backup owner, 0 whose owner has left.',
    ]);
    const calm = [app('Fine', {renewalDate: '2026-12-05'})];
    expect(executiveSummary(portfolioHealth(calm), outstandingRisk([], TODAY), accountability(calm, [], []), deadlines(calm, [], TODAY))).toEqual([
      'No notices are open.',
      '0 applications need attention out of 1; 1 of 1 has been checked.',
      '1 deadline or renewal falls in the next 30 days.',
      'Every application has an active owner and a backup owner.',
    ]);
    expect(executiveSummary(portfolioHealth([]), [], accountability([], [], []), deadlines([], [], TODAY))).toEqual(['No applications are registered yet, so nothing is being watched.']);
  });
});
