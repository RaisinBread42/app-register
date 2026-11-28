import {describe, expect, it} from 'vitest';
import {HEALTH_DIMENSION, HEALTH_STATUS} from '@/lib/constants';
import type {AppDetail, Health} from './api-client';
import {allDeductions, checkTimes, checkTimesLine, scoreBasis} from './register-view';

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

  it('last checked is shown per source; a hosting run that failed is not a check (it reads "check failed"), and nothing recorded reads "Not checked yet"', () => {
    const app = {
      dependencies: [{checkedAt: '2026-11-27T05:00:00Z'}, {checkedAt: null}],
      hosting: [{healthCheckedAt: '2026-11-28T05:17:00Z', healthError: 'AWS Health: timed out'}],
    } as unknown as AppDetail;
    expect(checkTimes(app)).toEqual({dependencies: '2026-11-27T05:00:00Z', hosting: null});
    expect(checkTimesLine(app)).toBe('Dependencies 27 Nov 2026 · Hosting check failed');
    expect(checkTimesLine({...app, hosting: [{healthCheckedAt: null, healthError: null}]} as unknown as AppDetail)).toBe('Dependencies 27 Nov 2026 · Hosting not checked yet');
    expect(checkTimesLine({dependencies: [], hosting: []} as unknown as AppDetail)).toBe('Not checked yet');
  });

  it('the score says what it covers: the checks behind it, the ones not checked yet, and those not monitored', () => {
    const health = {
      score: 95,
      dimensions: {
        [HEALTH_DIMENSION.dependencies]: {status: HEALTH_STATUS.ok, deductions: []},
        [HEALTH_DIMENSION.hosting]: {status: HEALTH_STATUS.na, deductions: []},
        [HEALTH_DIMENSION.licence]: null,
        [HEALTH_DIMENSION.pricing]: null,
      },
    } as unknown as Health;
    expect(scoreBasis(health)).toBe('Based on dependencies (1 of 2 checks); hosting not checked yet. Licence and pricing checks are coming soon.');
  });
});
