import {describe, expect, it} from 'vitest';
import {MATCH_CONFIDENCE, MATCH_STATUS, NOTICE_CATEGORY, NOTICE_ORIGIN, NOTICE_SEVERITY, NOTICE_SOURCE, type MatchStatus, type NoticeSeverity} from '@/lib/constants';
import type {Notice, NoticeMatch} from './api-client';
import {DEFAULT_INBOX_VIEW, INBOX_GROUP, INBOX_STATUS, inboxQuery, inboxRows, inboxViewFrom, nextStep, openCount, tomorrow} from './notice-inbox';

function match(app: string, status: MatchStatus = MATCH_STATUS.new, resolvedAt: string | null = null): NoticeMatch {
  return {
    id: `${app}-match`,
    app: {id: `${app}-id`, name: app},
    component: 'left-pad',
    version: '1.0.0',
    region: null,
    matchReason: 'uses it',
    confidence: MATCH_CONFIDENCE.high,
    firstSeenAt: '2026-11-28T09:00:00Z',
    lastSeenAt: '2026-11-28T09:00:00Z',
    resolvedAt,
    status,
    statusNote: null,
    snoozedUntil: null,
    statusChangedAt: null,
    assignee: null,
  };
}

function notice(title: string, severity: NoticeSeverity, matches: NoticeMatch[], dueOn: string | null = null): Notice {
  return {
    id: title,
    category: NOTICE_CATEGORY.security,
    severity,
    title,
    summary: '',
    source: NOTICE_SOURCE.osv,
    sourceName: 'OSV',
    sourceUrl: null,
    externalId: 'GHSA-1',
    origin: NOTICE_ORIGIN.external,
    publishedAt: null,
    dueOn,
    firstSeenAt: '2026-11-28T09:00:00Z',
    lastSeenAt: '2026-11-28T09:00:00Z',
    resolvedUpstreamAt: null,
    matches,
  };
}

const NOTICES = [
  notice('Low one', NOTICE_SEVERITY.low, [match('Zeta')]),
  notice('Critical one', NOTICE_SEVERITY.critical, [match('Alpha'), match('Beta', MATCH_STATUS.handled)]),
  notice('High soon', NOTICE_SEVERITY.high, [match('Alpha', MATCH_STATUS.snoozed)], '2026-12-01'),
  notice('Gone', NOTICE_SEVERITY.critical, [match('Gamma', MATCH_STATUS.new, '2026-11-28T10:00:00Z')]),
];

describe('notice inbox', () => {
  it('shows one row per notice on one app, open ones by default, most severe first; resolved matches never show', () => {
    expect(inboxRows(NOTICES, DEFAULT_INBOX_VIEW).map(({notice: n, match: m}) => `${n.title}/${m.app.name}`)).toEqual([
      'Critical one/Alpha',
      'Low one/Zeta',
    ]);
  });

  it('status, severity and application filters narrow the rows; grouping by application orders by app first', () => {
    expect(inboxRows(NOTICES, {...DEFAULT_INBOX_VIEW, status: INBOX_STATUS.snoozed}).map((row) => row.notice.title)).toEqual(['High soon']);
    expect(inboxRows(NOTICES, {...DEFAULT_INBOX_VIEW, status: INBOX_STATUS.handled}).map((row) => row.match.app.name)).toEqual(['Beta']);
    expect(inboxRows(NOTICES, {...DEFAULT_INBOX_VIEW, status: INBOX_STATUS.all, app: 'Alpha-id'})).toHaveLength(2);
    const byApp = inboxRows(NOTICES, {...DEFAULT_INBOX_VIEW, status: INBOX_STATUS.all, group: INBOX_GROUP.app});
    expect(byApp.map((row) => row.match.app.name)).toEqual(['Alpha', 'Alpha', 'Beta', 'Zeta']);
  });

  it('the view round-trips through the URL, a deep link names the open notice, and defaults leave the URL plain', () => {
    const view = {...DEFAULT_INBOX_VIEW, status: INBOX_STATUS.handled, severity: NOTICE_SEVERITY.high, notice: 'abc'};
    expect(inboxViewFrom(Object.fromEntries(new URLSearchParams(inboxQuery(view).slice(1))))).toEqual(view);
    expect(inboxQuery(DEFAULT_INBOX_VIEW)).toBe('');
    expect(inboxViewFrom({status: 'bogus', severity: 'apocalyptic'})).toEqual(DEFAULT_INBOX_VIEW);
  });

  it('the nav count is the open rows, and every kind of notice gets a plain next step naming the app', () => {
    expect(openCount(NOTICES)).toBe(2);
    const [row] = inboxRows(NOTICES, DEFAULT_INBOX_VIEW);
    expect(nextStep(row.notice, row.match)).toMatch(/Upgrade left-pad on Alpha/);
    expect(tomorrow('2026-12-31')).toBe('2027-01-01');
  });
});
