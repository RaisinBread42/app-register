import {
  HEALTH_ATTENTION_BELOW,
  HEALTH_CRITICAL_BELOW,
  HEALTH_DIMENSION,
  HEALTH_DIMENSIONS,
  HEALTH_MAX_SCORE,
  HEALTH_STATUS,
  type HealthDimension,
  type HealthStatus,
} from '@/lib/constants';
import {dependencyDeductions, type DependencyFacts} from './dependency-health';

/**
 * An app's health score: start at 100 and take off the points of every
 * deduction, never going below 0. Below 80 is `critical`, below 95 is
 * `attention`, otherwise `ok`.
 *
 * Each dimension (dependencies, hosting, licence, pricing) reports its own
 * deductions through one line in REPORTERS. A dimension with no reporter is not
 * monitored yet and shows as `null`; a reporter that answers `null` has nothing
 * recorded to check (`na`). Both leave the score alone.
 */

/** One reason an app lost points. `points` is a positive number of points taken off. */
export type Deduction = {dimension: HealthDimension; label: string; detail: string; points: number};

export type DimensionHealth = {status: HealthStatus; deductions: Deduction[]};

export type AppHealth = {
  /** 0–100, or null when no dimension has anything to check. */
  score: number | null;
  status: HealthStatus;
  dimensions: Record<HealthDimension, DimensionHealth | null>;
};

/** What the reporters read about one app. A new dimension adds its own field here. */
export type HealthFacts = {dependencies: DependencyFacts[]};

/** An app's deductions for one dimension, or null when the app records nothing for it. */
type Reporter = (facts: HealthFacts) => Deduction[] | null;

/** To monitor another dimension, add its reporter here. */
const REPORTERS: Partial<Record<HealthDimension, Reporter>> = {
  [HEALTH_DIMENSION.dependencies]: (facts) => dependencyDeductions(facts.dependencies),
};

export function computeHealth(deductions: Deduction[]): {score: number; status: HealthStatus} {
  const lost = deductions.reduce((total, deduction) => total + deduction.points, 0);
  const score = Math.max(0, HEALTH_MAX_SCORE - lost);
  return {score, status: statusForScore(score)};
}

export function statusForScore(score: number): HealthStatus {
  if (score < HEALTH_CRITICAL_BELOW) {
    return HEALTH_STATUS.critical;
  }
  return score < HEALTH_ATTENTION_BELOW ? HEALTH_STATUS.attention : HEALTH_STATUS.ok;
}

export function appHealth(facts: HealthFacts): AppHealth {
  const dimensions = {} as AppHealth['dimensions'];
  const all: Deduction[] = [];
  let isChecked = false;

  for (const dimension of HEALTH_DIMENSIONS) {
    const reporter = REPORTERS[dimension];
    const deductions = reporter ? reporter(facts) : undefined;
    if (deductions === undefined) {
      dimensions[dimension] = null;
    } else if (deductions === null) {
      dimensions[dimension] = {status: HEALTH_STATUS.na, deductions: []};
    } else {
      const worstFirst = [...deductions].sort((a, b) => b.points - a.points);
      dimensions[dimension] = {status: computeHealth(worstFirst).status, deductions: worstFirst};
      all.push(...worstFirst);
      isChecked = true;
    }
  }
  return isChecked
    ? {...computeHealth(all), dimensions}
    : {score: null, status: HEALTH_STATUS.na, dimensions};
}
