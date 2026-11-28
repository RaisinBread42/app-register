import {MONITORING_SOURCE_STATUS, MS_PER_HOUR, SOURCE_FRESH_HOURS} from '@/lib/constants';
import type {MonitoringSource} from './api-client';

/**
 * Whether the monitoring data is current enough to say that nothing needs attention
 * (spec §8: stale data never reads as safe). Sources that nothing has used yet are
 * left out; the rest must have answered on their last check, recently.
 */

/**
 * Sources an active app relies on whose last check failed, or whose last answer is
 * older than 36 hours. A source nothing relies on any more is never asked again, so
 * it is not counted.
 */
export function staleSources(sources: MonitoringSource[], now: Date): MonitoringSource[] {
  const oldest = now.getTime() - SOURCE_FRESH_HOURS * MS_PER_HOUR;
  return sources.filter(
    (source) =>
      source.appNames.length > 0 &&
      (source.status === MONITORING_SOURCE_STATUS.unavailable ||
        (source.status === MONITORING_SOURCE_STATUS.reachable && (!source.lastRefreshedAt || Date.parse(source.lastRefreshedAt) < oldest))),
  );
}

/** True once at least one source has answered. */
export function hasEverAnswered(sources: MonitoringSource[]): boolean {
  return sources.some((source) => source.status === MONITORING_SOURCE_STATUS.reachable);
}
