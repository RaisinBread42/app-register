import {describe, expect, it} from 'vitest';
import {MONITORING_SOURCE_STATUS, type MonitoringSourceStatus} from '@/lib/constants';
import type {MonitoringSource} from './api-client';
import {hasEverAnswered, staleSources} from './freshness';

const NOW = new Date('2026-11-28T12:00:00Z');
const source = (name: string, status: MonitoringSourceStatus, lastRefreshedAt: string | null, appNames = ['Portal']): MonitoringSource =>
  ({id: name, name, monitors: 'x', status, lastRefreshedAt, appNames, url: 'https://x.test'}) as MonitoringSource;

describe('source freshness', () => {
  it('a source is out of date when its last check failed or it last answered more than 36 hours ago; unused sources, and ones no active app relies on any more, are not', () => {
    const sources = [
      source('Fresh', MONITORING_SOURCE_STATUS.reachable, '2026-11-28T05:00:00Z'),
      source('Old', MONITORING_SOURCE_STATUS.reachable, '2026-11-26T05:00:00Z'),
      source('Down', MONITORING_SOURCE_STATUS.unavailable, '2026-11-28T05:00:00Z'),
      source('Unused', MONITORING_SOURCE_STATUS.configured, null),
      source('Abandoned', MONITORING_SOURCE_STATUS.unavailable, '2026-11-20T05:00:00Z', []),
    ];
    expect(staleSources(sources, NOW).map((row) => row.name)).toEqual(['Old', 'Down']);
  });

  it('until any source has answered, nothing counts as checked', () => {
    expect(hasEverAnswered([source('Unused', MONITORING_SOURCE_STATUS.configured, null)])).toBe(false);
    expect(hasEverAnswered([source('Fresh', MONITORING_SOURCE_STATUS.reachable, '2026-11-28T05:00:00Z')])).toBe(true);
  });
});
