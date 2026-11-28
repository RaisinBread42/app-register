import {describe, expect, it} from 'vitest';
import {APP_CRITICALITY, APP_LIST_SORT, MATCH_STATUS, NOTICE_SEVERITY, type AppCriticality} from '@/lib/constants';
import type {App, Notice} from './api-client';
import {applyAppListView, DEFAULT_APP_LIST_VIEW, nextDate, topIssues, type AppListView} from './catalog';
import {appListQuery, appListViewFrom} from './list-filters';
import {upcomingDates} from './overview';

/** Adversarial tests for [23] (catalog), kept as regression tests after the fixes. */

const TODAY = '2026-11-28';
const YESTERDAY = '2026-11-27';

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

const notice = (title: string, severity: string, matches: {app: string; status?: string; resolvedAt?: string | null}[]): Notice =>
  ({
    id: title,
    title,
    severity,
    category: 'security',
    dueOn: null,
    lastSeenAt: '2026-11-28T09:00:00Z',
    matches: matches.map((match, index) => ({
      id: `${title}-m${index}`,
      app: {id: `${match.app}-id`, name: match.app},
      status: match.status ?? MATCH_STATUS.new,
      resolvedAt: match.resolvedAt ?? null,
    })),
  }) as unknown as Notice;

const critical = (value: AppCriticality | null) => ({criticality: value});
const score = (value: number | null) => ({health: {score: value} as App['health']});
const names = (apps: App[], view: Partial<AppListView>, notices: Notice[] = []) =>
  applyAppListView(apps, {...DEFAULT_APP_LIST_VIEW, ...view}, topIssues(notices), TODAY).map((row) => row.name);

describe('[23] catalog, adversarial', () => {

  it('a notice matching several apps is the top issue of each; a resolved or handled match is not', () => {
    const issues = topIssues([
      notice('Shared', NOTICE_SEVERITY.high, [{app: 'A'}, {app: 'B', status: MATCH_STATUS.handled}, {app: 'C', resolvedAt: '2026-11-01T00:00:00Z'}]),
      notice('Reviewing', NOTICE_SEVERITY.low, [{app: 'B', status: MATCH_STATUS.reviewing}]),
    ]);
    expect(issues.get('A-id')?.title).toBe('Shared');
    expect(issues.get('B-id')?.title).toBe('Reviewing');
    expect(issues.has('C-id')).toBe(false);
  });

  it('an unrated (unknown) notice ranks below medium and above low, as the inbox ranks it', () => {
    const apps = [app('Low'), app('Unknown'), app('Medium')];
    const notices = [
      notice('l', NOTICE_SEVERITY.low, [{app: 'Low'}]),
      notice('u', NOTICE_SEVERITY.unknown, [{app: 'Unknown'}]),
      notice('m', NOTICE_SEVERITY.medium, [{app: 'Medium'}]),
    ];
    expect(names(apps, {}, notices)).toEqual(['Medium', 'Unknown', 'Low']);
  });

  it('repeated and old URL values fall back safely (?sort=renewal, two owners, ?health=)', () => {
    const view = appListViewFrom({sort: 'renewal', owner: ['a', 'b'], health: '', open_notices: ['0', '1']});
    expect(view).toEqual({...DEFAULT_APP_LIST_VIEW, owner: 'a'});
    expect(appListQuery(view)).toBe('?owner=a');
  });

  it('a search with URL-special characters round-trips', () => {
    const view = {...DEFAULT_APP_LIST_VIEW, query: 'R&D + ops #1 100%'};
    const params = Object.fromEntries(new URLSearchParams(appListQuery(view).slice(1)));
    expect(appListViewFrom(params)).toEqual(view);
  });

  // --- Findings: these are expected to FAIL on 28e4373. ---

  it('a notice deadline that passed yesterday stays visible in the catalog (spec Journey D: overdue stays visible; the Overview shows it as Passed)', () => {
    const overdue = app('Overdue', {noticeDeadline: YESTERDAY});
    // The Overview, from the same app, still shows it.
    expect(upcomingDates([overdue], TODAY).map((row) => [row.date, row.isOverdue])).toEqual([[YESTERDAY, true]]);
    // The catalog's Next date column says "None ahead" and the next-date sort treats it as undated.
    expect(nextDate(overdue, TODAY)).not.toBeNull();
  });

  it('with the next-date sort, an app whose notice deadline just passed sorts ahead of one with nothing for a year', () => {
    const apps = [app('Far renewal', {renewalDate: '2027-11-01'}), app('Overdue', {noticeDeadline: YESTERDAY})];
    expect(names(apps, {sort: APP_LIST_SORT.deadline})).toEqual(['Overdue', 'Far renewal']);
  });

  it('needs-attention-first never ranks an app with no health score (nothing checked) below a healthy 100 of the same criticality', () => {
    const apps = [app('Healthy', {...critical(APP_CRITICALITY.critical), ...score(100)}), app('Unchecked', {...critical(APP_CRITICALITY.critical), ...score(null)})];
    expect(names(apps, {})).toEqual(['Unchecked', 'Healthy']);
  });

  it('an app whose criticality is not set is not ranked below every low-criticality app (unknown is not "least important")', () => {
    const apps = [app('Low and fine', {...critical(APP_CRITICALITY.low), ...score(100)}), app('Not set, failing', {...critical(null), ...score(20)})];
    const notices = [
      notice('a', NOTICE_SEVERITY.critical, [{app: 'Low and fine'}]),
      notice('b', NOTICE_SEVERITY.critical, [{app: 'Not set, failing'}]),
    ];
    expect(names(apps, {}, notices)).toEqual(['Not set, failing', 'Low and fine']);
  });
});
