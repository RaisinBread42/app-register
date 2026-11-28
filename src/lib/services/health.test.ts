import {describe, expect, it} from 'vitest';
import {ADVISORY_SEVERITY, HEALTH_DIMENSION, HEALTH_STATUS, type AdvisorySeverity} from '@/lib/constants';
import type {DependencyFacts} from './dependency-health';
import {appHealth, computeHealth, type Deduction} from './health';

function dependency(name: string, overrides: Partial<DependencyFacts> = {}): DependencyFacts {
  return {
    name,
    currentVersion: '2.4.1',
    latestVersion: '2.4.9',
    vulnerabilities: [],
    advisories: [],
    isDev: false,
    checkedAt: new Date('2026-11-20T06:00:00Z'),
    checkError: null,
    ...overrides,
  };
}

function advisory(id: string, severity: AdvisorySeverity, aliases: string[] = []) {
  return {id, aliases, severity, summary: `Flaw ${id}`, url: `https://osv.dev/vulnerability/${id}`};
}

/** The health of an app that records these dependencies and no hosting. */
const scoreOf = (dependencies: DependencyFacts[]) => appHealth({dependencies, hosting: [], today: '2026-11-22'});

const lose = (points: number): Deduction => ({dimension: HEALTH_DIMENSION.dependencies, label: 'x', detail: 'y', points});

describe('health score', () => {
  it('a score starts at 100 and loses 10 per critical, 5 per high and 2 per medium advisory, 3 per dependency a major version behind and 1 per minor; low advisories cost nothing', () => {
    const health = scoreOf([
      dependency('ledger-core', {advisories: [advisory('GHSA-aaaa', ADVISORY_SEVERITY.critical), advisory('GHSA-bbbb', ADVISORY_SEVERITY.low)]}),
      dependency('tally-ui', {advisories: [advisory('GHSA-cccc', ADVISORY_SEVERITY.high), advisory('GHSA-dddd', ADVISORY_SEVERITY.medium)]}),
      dependency('quill-forms', {currentVersion: '3.9.0', latestVersion: '5.0.2'}),
      dependency('harbor-http', {currentVersion: '1.2.7', latestVersion: '1.6.0'}),
      dependency('patch-only', {currentVersion: '4.1.0', latestVersion: '4.1.9'}),
    ]);

    expect(health.score).toBe(100 - 10 - 5 - 2 - 3 - 1);
    expect(health.status).toBe(HEALTH_STATUS.critical);
    const deductions = health.dimensions.dependencies?.deductions ?? [];
    expect(deductions.map((d) => d.points)).toEqual([10, 5, 3, 2, 1]);
    expect(deductions[0]).toEqual({
      dimension: HEALTH_DIMENSION.dependencies,
      label: 'Critical advisory in ledger-core 2.4.1',
      detail: 'GHSA-aaaa · Flaw GHSA-aaaa',
      points: 10,
    });
    expect(deductions[2]).toMatchObject({label: 'quill-forms is a major version behind', detail: '3.9.0 → 5.0.2'});
  });

  it('a score below 80 is critical, below 95 needs attention, and 95 or more is ok; it never goes below 0', () => {
    expect(computeHealth([])).toEqual({score: 100, status: HEALTH_STATUS.ok});
    expect(computeHealth([lose(5)])).toEqual({score: 95, status: HEALTH_STATUS.ok});
    expect(computeHealth([lose(6)])).toEqual({score: 94, status: HEALTH_STATUS.attention});
    expect(computeHealth([lose(20)])).toEqual({score: 80, status: HEALTH_STATUS.attention});
    expect(computeHealth([lose(21)])).toEqual({score: 79, status: HEALTH_STATUS.critical});
    expect(computeHealth(Array.from({length: 13}, () => lose(10)))).toEqual({score: 0, status: HEALTH_STATUS.critical});
  });

  it('an app with no dependencies and no hosting recorded has no score and status na; dimensions not monitored yet are null', () => {
    expect(scoreOf([])).toEqual({
      score: null,
      status: HEALTH_STATUS.na,
      dimensions: {
        dependencies: {status: HEALTH_STATUS.na, deductions: []},
        hosting: {status: HEALTH_STATUS.na, deductions: []},
        licence: null,
        pricing: null,
      },
      staleSince: null,
      hasFailedCheck: false,
    });
    expect(scoreOf([dependency('tally-ui')])).toMatchObject({score: 100, status: HEALTH_STATUS.ok});
  });

  it('an advisory recorded by hand counts once: not again when monitoring finds it under another id, and as medium when monitoring does not know it', () => {
    const health = scoreOf([
      dependency('tally-ui', {
        vulnerabilities: ['cve-2026-4411', 'INTERNAL-77'],
        advisories: [advisory('GHSA-cccc', ADVISORY_SEVERITY.high, ['CVE-2026-4411'])],
      }),
    ]);
    expect(health.dimensions.dependencies?.deductions.map((d) => [d.label, d.points])).toEqual([
      ['High advisory in tally-ui 2.4.1', 5],
      ['Unrated advisory in tally-ui 2.4.1', 2],
    ]);
  });

  it('a dev dependency loses points for advisories but not for being behind', () => {
    const health = scoreOf([
      dependency('lint-kit', {isDev: true, currentVersion: '8.0.0', latestVersion: '10.1.0', advisories: [advisory('GHSA-eeee', ADVISORY_SEVERITY.medium)]}),
    ]);
    expect(health.score).toBe(98);
  });
});
