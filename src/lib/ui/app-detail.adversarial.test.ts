/**
 * Adversarial tests for [29] Application detail, kept as regression tests after the fixes.
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AUDIT_ACTION, MATCH_STATUS} from '@/lib/constants';
import type {AppDetail, AuditEvent} from './api-client';
import {activitySummary} from './activity';
import {checkTimes} from './register-view';

const TODAY_CHECK = '2026-11-28T05:17:00.000Z';
const OLD_CHECK = '2026-10-01T05:17:00.000Z';

const app = (extra: Partial<AppDetail>): AppDetail => ({id: 'app-1', dependencies: [], hosting: [], ...extra}) as unknown as AppDetail;

describe('[29] adversarial: header "Last checked" (source freshness, spec §8)', () => {
  it('ADV-U1: a hosting check whose sources all failed is not shown as the last check', () => {
    const failedOnly = app({hosting: [{healthCheckedAt: TODAY_CHECK, healthError: 'endoflife.date did not answer'}] as AppDetail['hosting']});
    // The hosting check wrote healthCheckedAt AND healthError; the header still says it was checked just now.
    expect(checkTimes(failedOnly).hosting, 'a failed check must not read as a fresh check').toBeNull();
  });

  it('ADV-U2: a stale hosting check (58 days old) is hidden behind a fresh dependency check', () => {
    const mixed = app({
      dependencies: [{checkedAt: TODAY_CHECK}] as AppDetail['dependencies'],
      hosting: [{healthCheckedAt: OLD_CHECK, healthError: null}] as AppDetail['hosting'],
    });
    // Each source is shown with its own time, so the old hosting check is visible.
    expect(checkTimes(mixed), 'freshness should not hide the stalest source').toEqual({dependencies: TODAY_CHECK, hosting: OLD_CHECK});
  });
});

describe('[29] adversarial: Activity tab wording', () => {
  it('ADV-U3: a snooze in the history says until when', () => {
    const event = {
      id: 'e1',
      occurredAt: TODAY_CHECK,
      actor: 'API key "UI"',
      action: AUDIT_ACTION.noticeStatusChanged,
      subjectKind: 'match',
      subjectId: 'm1',
      appId: 'app-1',
      appName: 'Northwind Portal',
      noticeId: 'n1',
      noticeTitle: 'Demo advisory',
      fromValue: MATCH_STATUS.new,
      toValue: MATCH_STATUS.snoozed,
      snoozedUntil: '2099-01-01',
      note: 'Waiting for the vendor fix',
    } as AuditEvent;
    // The Activity tab renders activitySummary + time + note; snoozedUntil is never shown.
    expect(activitySummary(event)).toMatch(/2099|1 Jan 2099/);
  });
});

describe('[29] adversarial: page.tsx loading and errors', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib/ui/api-client');
    vi.doUnmock('@/app/(register)/applications/[id]/load-app');
    vi.doUnmock('@/app/(register)/applications/[id]/AppDetailView');
  });

  it('ADV-U4: when only the Activity history cannot be read, the application page still renders', async () => {
    vi.doMock('@/app/(register)/applications/[id]/load-app', () => ({
      loadApp: async (id: string) => ({id, name: 'Northwind Portal', dependencies: [], hosting: []}),
    }));
    vi.doMock('@/app/(register)/applications/[id]/AppDetailView', () => ({AppDetailView: () => null}));
    vi.doMock('@/lib/ui/api-client', () => ({
      apiClient: () => ({
        getHostingCatalog: async () => ({providers: [], runtimes: []}),
        listNotices: async () => [],
        listAuditEvents: async () => {
          throw new Error('audit-events answered 500');
        },
      }),
    }));
    const {default: AppPage} = await import('@/app/(register)/applications/[id]/page');
    const render = AppPage({params: Promise.resolve({id: 'app-1'}), searchParams: Promise.resolve({})});
    // A secondary panel failing should not replace the whole detail page with "This page could not load".
    await expect(render).resolves.toBeTruthy();
  });

  it('ADV-U5: the app, catalog, notices and activity are fetched in parallel (no added waterfall)', async () => {
    const order: string[] = [];
    let releaseApp: () => void = () => {};
    vi.doMock('@/app/(register)/applications/[id]/load-app', () => ({
      loadApp: (id: string) =>
        new Promise((resolve) => {
          order.push('app:start');
          releaseApp = () => resolve({id, name: 'Northwind Portal', dependencies: [], hosting: []});
        }),
    }));
    vi.doMock('@/app/(register)/applications/[id]/AppDetailView', () => ({AppDetailView: () => null}));
    vi.doMock('@/lib/ui/api-client', () => ({
      apiClient: () => ({
        getHostingCatalog: async () => (order.push('catalog:start'), {providers: [], runtimes: []}),
        listNotices: async () => (order.push('notices:start'), []),
        listAuditEvents: async () => (order.push('activity:start'), []),
      }),
    }));
    const {default: AppPage} = await import('@/app/(register)/applications/[id]/page');
    const render = AppPage({params: Promise.resolve({id: 'app-1'}), searchParams: Promise.resolve({})});
    await new Promise((resolve) => setTimeout(resolve, 20));
    const startedBeforeAppAnswered = [...order];
    releaseApp();
    await render;
    // Before this change the catalog was fetched alongside the app; now nothing starts until the app answers.
    expect(startedBeforeAppAnswered).toContain('catalog:start');
  });
});
