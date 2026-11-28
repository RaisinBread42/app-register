import {describe, expect, it} from 'vitest';
import {MATCH_CONFIDENCE, MATCH_STATUS, NOTICE_CATEGORY, NOTICE_ORIGIN, NOTICE_SEVERITY, NOTICE_SOURCE, type NoticeCategory} from '@/lib/constants';
import type {Notice, NoticeMatch} from './api-client';
import {nextStep} from './notice-inbox';

/** Adversarial review of 9084c89: the "what to do" line in the drawer. */
const match: NoticeMatch = {
  id: 'm1', app: {id: 'a1', name: 'Northwind Portal'}, component: 'Node.js', version: '18', region: null,
  matchReason: 'runs on it', confidence: MATCH_CONFIDENCE.high, firstSeenAt: '2026-11-28T09:00:00Z', lastSeenAt: '2026-11-28T09:00:00Z',
  resolvedAt: null, status: MATCH_STATUS.new, statusNote: null, snoozedUntil: null, statusChangedAt: null, assignee: null,
};
const notice = (category: NoticeCategory, dueOn: string | null): Notice => ({
  id: 'n1', category, severity: NOTICE_SEVERITY.high, title: 't', summary: '', source: NOTICE_SOURCE.osv, sourceName: 's', sourceUrl: null,
  externalId: null, origin: NOTICE_ORIGIN.external, publishedAt: null, dueOn, firstSeenAt: '2026-11-28T09:00:00Z', lastSeenAt: '2026-11-28T09:00:00Z',
  resolvedUpstreamAt: null, matches: [match],
});

const TODAY = '2026-11-28';

describe('nextStep (adversarial)', () => {
  it('names the affected app for every kind of notice, as the shipped test title claims', () => {
    for (const category of Object.values(NOTICE_CATEGORY)) {
      expect(nextStep(notice(category, '2027-01-31'), match, TODAY), category).toContain('Northwind Portal');
    }
  });

  it('does not tell the user to act "before" a support-end date that has already passed', () => {
    // Seeded e2e data: "Node.js 18 is past end of support (2025-04-30)"; today is 2026-11-28.
    expect(nextStep(notice(NOTICE_CATEGORY.lifecycle, '2025-04-30'), match, TODAY)).not.toMatch(/before 2025-04-30/);
  });
});
