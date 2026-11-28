import {describe, expect, it} from 'vitest';
import {HEALTH_STATUS} from '@/lib/constants';
import type {Hosting} from './api-client';
import {checkTimesLine, hostingStatusReason} from './register-view';

/** ADV31 UI helpers: what a stale hosting row (last good reading kept, latest check failed) reads as. */
describe('ADV31 source freshness UI', () => {
  const stale = {
    status: HEALTH_STATUS.stale,
    isMonitored: true,
    healthCheckedAt: '2026-11-28T06:00:00.000Z',
    lastGoodCheckAt: '2026-11-20T06:00:00.000Z',
    healthError: 'Vercel status could not be reached (HTTP 503)',
  } as unknown as Hosting;

  it('ADV31-UI1 a stale row was checked: "Last checked" gives the time of the reading shown, and the row says why it is stale', () => {
    expect(checkTimesLine({dependencies: [], hosting: [stale]})).toBe('Hosting 20 Nov 2026');
    expect(hostingStatusReason(stale)).toBe('Found on 20 Nov 2026; the latest check failed');
    expect(checkTimesLine({dependencies: [], hosting: [{...stale, lastGoodCheckAt: null}]})).toBe('Hosting check failed');
  });
});
