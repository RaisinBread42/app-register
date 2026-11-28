import {describe, expect, it} from 'vitest';
import {APP_CRITICALITY, APP_HEALTH_FILTER, APP_LIST_SORT, DATE_KIND, MATCH_STATUS, NOTICE_SEVERITY, type AppCriticality} from '@/lib/constants';
import type {App, Notice} from './api-client';
import {applyAppListView, catalogOwners, DEFAULT_APP_LIST_VIEW, isFiltered, nextDate, topIssues, type AppListView} from './catalog';

const TODAY = '2026-11-28';

const app = (name: string, extra: Partial<App> = {}): App =>
  ({
    id: `${name}-id`,
    name,
    kind: 'saas',
    criticality: null,
    owner: {id: 'priya', name: 'Priya Chen'},
    noticeDeadline: null,
    renewalDate: null,
    health: {score: 100},
    ...extra,
  }) as unknown as App;

const notice = (title: string, severity: string, appName: string, status: string = MATCH_STATUS.new): Notice =>
  ({
    id: title,
    title,
    severity,
    dueOn: null,
    lastSeenAt: '2026-11-28T09:00:00Z',
    matches: [{id: `${title}-m`, app: {id: `${appName}-id`, name: appName}, status, resolvedAt: null}],
  }) as unknown as Notice;

const critical = (value: AppCriticality) => ({criticality: value});
const score = (value: number | null) => ({health: {score: value} as App['health']});
const names = (apps: App[], view: Partial<AppListView>, notices: Notice[] = []) =>
  applyAppListView(apps, {...DEFAULT_APP_LIST_VIEW, ...view}, topIssues(notices), TODAY).map((row) => row.name);

describe('applications catalog', () => {
  it('AC2: by default the most severe open notice comes first, then criticality, then lowest health; snoozed and handled notices do not count', () => {
    const apps = [
      app('Quiet', {...critical(APP_CRITICALITY.critical), ...score(60)}),
      app('Low issue', critical(APP_CRITICALITY.low)),
      app('High issue, low criticality', critical(APP_CRITICALITY.low)),
      app('High issue, critical', critical(APP_CRITICALITY.critical)),
      app('Snoozed critical', critical(APP_CRITICALITY.critical)),
    ];
    const notices = [
      notice('Minor', NOTICE_SEVERITY.low, 'Low issue'),
      notice('Big', NOTICE_SEVERITY.high, 'High issue, low criticality'),
      notice('Big too', NOTICE_SEVERITY.high, 'High issue, critical'),
      notice('Later', NOTICE_SEVERITY.critical, 'Snoozed critical', MATCH_STATUS.snoozed),
    ];
    expect(names(apps, {}, notices)).toEqual(['High issue, critical', 'High issue, low criticality', 'Low issue', 'Quiet', 'Snoozed critical']);
  });

  it('AC2: the other sorts are name A–Z, lowest health (no score last) and the next date ahead (passed dates ignored, undated last)', () => {
    const apps = [
      app('Bravo', {...score(70), renewalDate: '2027-02-01', noticeDeadline: '2026-11-01'}),
      app('Alpha', {...score(null), noticeDeadline: '2026-12-15'}),
      app('Charlie', score(90)),
    ];
    expect(names(apps, {sort: APP_LIST_SORT.name})).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(names(apps, {sort: APP_LIST_SORT.health})).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(names(apps, {sort: APP_LIST_SORT.deadline})).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(nextDate(apps[0], TODAY)).toEqual({date: '2027-02-01', kind: DATE_KIND.renewal});
  });

  it('AC3: filters narrow by criticality, owner, health state (not monitored is its own state) and open notices', () => {
    const marcus = {id: 'marcus', name: 'Marcus Okonkwo'};
    const apps = [app('Ledger', {...critical(APP_CRITICALITY.high), owner: marcus}), app('Portal', score(null)), app('Wiki', score(80))];
    const notices = [notice('Old TLS', NOTICE_SEVERITY.medium, 'Wiki'), notice('Done', NOTICE_SEVERITY.high, 'Ledger', MATCH_STATUS.handled)];
    expect(names(apps, {criticality: APP_CRITICALITY.high})).toEqual(['Ledger']);
    expect(names(apps, {owner: marcus.id})).toEqual(['Ledger']);
    expect(names(apps, {health: APP_HEALTH_FILTER.notMonitored})).toEqual(['Portal']);
    expect(names(apps, {health: APP_HEALTH_FILTER.attention})).toEqual(['Wiki']);
    expect(names(apps, {openNotices: true}, notices)).toEqual(['Wiki']);
    expect(catalogOwners(apps)).toEqual([
      {value: 'marcus', label: 'Marcus Okonkwo'},
      {value: 'priya', label: 'Priya Chen'},
    ]);
  });

  it('each app shows its most severe open notice; an app with none has no entry', () => {
    const issues = topIssues([notice('Medium', NOTICE_SEVERITY.medium, 'Wiki'), notice('Critical', NOTICE_SEVERITY.critical, 'Wiki')]);
    expect(issues.get('Wiki-id')?.notice.title).toBe('Critical');
    expect(issues.has('Ledger-id')).toBe(false);
  });

  it('a blank search does not count as a filter; the sort alone never does', () => {
    expect(isFiltered({...DEFAULT_APP_LIST_VIEW, query: '   ', sort: APP_LIST_SORT.name})).toBe(false);
    expect(isFiltered({...DEFAULT_APP_LIST_VIEW, openNotices: true})).toBe(true);
  });
});
