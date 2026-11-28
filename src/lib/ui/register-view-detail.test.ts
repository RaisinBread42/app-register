import {describe, expect, it} from 'vitest';
import {HEALTH_DIMENSION} from '@/lib/constants';
import type {AppDetail, Health} from './api-client';
import {allDeductions, latestCheck} from './register-view';

describe('application detail helpers', () => {
  it('lists every deduction biggest first, so the page can show the top three and the rest on request', () => {
    const health = {
      dimensions: {
        [HEALTH_DIMENSION.dependencies]: {deductions: [{label: 'a', points: 3}, {label: 'b', points: 10}]},
        [HEALTH_DIMENSION.hosting]: {deductions: [{label: 'c', points: 25}]},
        [HEALTH_DIMENSION.licence]: null,
        [HEALTH_DIMENSION.pricing]: null,
      },
    } as unknown as Health;
    expect(allDeductions(health).map((deduction) => deduction.points)).toEqual([25, 10, 3]);
  });

  it('last checked is the latest dependency or hosting check, and null when nothing was ever checked', () => {
    const app = {
      dependencies: [{checkedAt: '2026-11-27T05:00:00Z'}, {checkedAt: null}],
      hosting: [{healthCheckedAt: '2026-11-28T05:17:00Z'}],
    } as unknown as AppDetail;
    expect(latestCheck(app)).toBe('2026-11-28T05:17:00Z');
    expect(latestCheck({dependencies: [], hosting: []} as unknown as AppDetail)).toBeNull();
  });
});
