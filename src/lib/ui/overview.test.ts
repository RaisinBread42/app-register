import {describe, expect, it} from 'vitest';
import {AUDIT_ACTION, MATCH_STATUS, MONITORING_SOURCE_STATUS, NOTICE_SEVERITY} from '@/lib/constants';
import type {App, AuditEvent, MonitoringSource, Notice} from './api-client';
import {activityLine} from './activity';
import {checkStatusLine, keyNumbers, lastSuccessfulCheck, portfolioSummary, upcomingDates, urgentQueue} from './overview';

const TODAY = '2026-11-28';

const app = (name: string, extra: Partial<App> = {}): App =>
  ({id: `${name}-id`, name, noticeDeadline: null, renewalDate: null, health: {score: null}, ...extra}) as unknown as App;

const notice = (title: string, severity: string, appName: string, status: string = MATCH_STATUS.new): Notice =>
  ({
    id: title,
    title,
    severity,
    dueOn: null,
    lastSeenAt: '2026-11-28T09:00:00Z',
    matches: [{id: `${title}-m`, app: {id: `${appName}-id`, name: appName}, status, resolvedAt: null}],
  }) as unknown as Notice;

const source = (status: string, lastRefreshedAt: string | null): MonitoringSource =>
  ({id: status + lastRefreshedAt, name: 'x', monitors: 'y', status, lastRefreshedAt, appNames: ['Portal'], url: 'https://x.test'}) as MonitoringSource;

describe('overview', () => {
  it('key numbers: open notices (critical, in review, snoozed apart), notice deadlines in 30 days and passed ones, sources out of date', () => {
    const notices = [
      notice('A', NOTICE_SEVERITY.critical, 'Portal'),
      notice('B', NOTICE_SEVERITY.high, 'Portal'),
      notice('C', NOTICE_SEVERITY.critical, 'Portal', MATCH_STATUS.handled),
    ];
    const apps = [app('Soon', {noticeDeadline: '2026-12-20'}), app('Later', {noticeDeadline: '2027-03-01'}), app('Past', {noticeDeadline: '2026-11-01'})];
    const sources = [source(MONITORING_SOURCE_STATUS.unavailable, null), source(MONITORING_SOURCE_STATUS.reachable, '2026-11-28T05:17:00Z')];
    expect(keyNumbers(notices, apps, sources, TODAY)).toEqual({
      needAttention: 2,
      critical: 1,
      inReview: 0,
      snoozed: 0,
      deadlinesSoon: 1,
      overdue: 1,
      staleSources: 1,
    });
  });

  it('the urgent queue is the open notices most severe first, capped, never including snoozed or handled ones', () => {
    const notices = [notice('Low', NOTICE_SEVERITY.low, 'A'), notice('Crit', NOTICE_SEVERITY.critical, 'B'), notice('Snz', NOTICE_SEVERITY.critical, 'C', MATCH_STATUS.snoozed)];
    expect(urgentQueue(notices, 5).map((row) => row.notice.title)).toEqual(['Crit', 'Low']);
    expect(urgentQueue(notices, 1)).toHaveLength(1);
  });

  it('upcoming dates list notice deadlines and renewals in the next 90 days, soonest first', () => {
    const apps = [app('Ledger', {noticeDeadline: '2026-12-23', renewalDate: '2027-01-22'}), app('Far', {renewalDate: '2027-06-01'})];
    expect(upcomingDates(apps, TODAY).map((row) => `${row.title} ${row.date}`)).toEqual([
      'Ledger notice deadline 2026-12-23',
      'Ledger renewal 2027-01-22',
    ]);
  });

  it('the portfolio summary names apps that nothing monitors instead of counting them healthy; last check is the latest answer, even from a source failing now', () => {
    const apps = [app('Scored', {health: {score: 90} as App['health']}), app('Unscored')];
    expect(portfolioSummary(apps, [notice('A', NOTICE_SEVERITY.high, 'Scored')])).toEqual({total: 2, monitored: 1, notMonitored: 1, withOpenNotices: 1});
    expect(lastSuccessfulCheck([source(MONITORING_SOURCE_STATUS.reachable, '2026-11-27T05:00:00Z'), source(MONITORING_SOURCE_STATUS.reachable, '2026-11-28T05:00:00Z')])).toBe('2026-11-28T05:00:00Z');
    expect(lastSuccessfulCheck([source(MONITORING_SOURCE_STATUS.unavailable, '2026-11-28T05:00:00Z')])).toBe('2026-11-28T05:00:00Z');
    expect(lastSuccessfulCheck([source(MONITORING_SOURCE_STATUS.unavailable, null), source(MONITORING_SOURCE_STATUS.configured, null)])).toBeNull();
  });

  it('a history line says which notice on which app (or which app was archived) and the new status; the header never shows a failed run as a success', () => {
    const event = (extra: Partial<AuditEvent>): AuditEvent =>
      ({id: 'e', occurredAt: '2026-11-28T09:00:00Z', actor: 'API key "Ops"', appName: null, noticeTitle: null, toValue: null, ...extra}) as AuditEvent;
    expect(activityLine(event({action: AUDIT_ACTION.noticeStatusChanged, noticeTitle: 'Old TLS', appName: 'Portal', toValue: MATCH_STATUS.reviewing}))).toBe(
      '28 Nov 2026, 09:00 UTC · API key "Ops" changed the status of “Old TLS” on Portal (now Reviewing)',
    );
    expect(activityLine(event({action: AUDIT_ACTION.appArchived, appName: 'Room Booker'}))).toMatch(/archived Room Booker$/);
    expect(checkStatusLine([source(MONITORING_SOURCE_STATUS.unavailable, null)])).toBe('No source answered on the last check.');
    expect(checkStatusLine(null)).toMatch(/Could not read/);
  });
});
