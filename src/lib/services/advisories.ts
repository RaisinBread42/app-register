import {
  ADVISORY_ID_MAX_LENGTH,
  ADVISORY_MAX_ALIASES,
  ADVISORY_SEVERITIES,
  ADVISORY_SEVERITY,
  ADVISORY_SUMMARY_MAX_LENGTH,
  OSV_ADVISORY_PAGE_URL,
  type AdvisorySeverity,
} from '@/lib/constants';
import type {StoredAdvisory} from '@/lib/db/schema';

/**
 * The one shape an advisory may have, on the way into the database and on the
 * way out. Advisories come from an outside source, so nothing is trusted: a
 * wrong type is dropped or replaced, long text is cut, and the link is always
 * rebuilt from the id so it can only point at OSV.
 */

/** True for an id worth storing: text, not blank, not absurdly long. */
export function isAdvisoryId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= ADVISORY_ID_MAX_LENGTH;
}

/** The advisory as it may be stored and shown, or null when it has no usable id. */
export function normaliseAdvisory(value: unknown): StoredAdvisory | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const {id, aliases, severity, summary} = value as Record<string, unknown>;
  if (!isAdvisoryId(id)) {
    return null;
  }
  return {
    id,
    aliases: Array.isArray(aliases) ? aliases.filter(isAdvisoryId).slice(0, ADVISORY_MAX_ALIASES) : [],
    severity: (ADVISORY_SEVERITIES as readonly unknown[]).includes(severity)
      ? (severity as AdvisorySeverity)
      : ADVISORY_SEVERITY.unknown,
    summary: typeof summary === 'string' ? summary.slice(0, ADVISORY_SUMMARY_MAX_LENGTH) : '',
    url: `${OSV_ADVISORY_PAGE_URL}/${encodeURIComponent(id)}`,
  };
}

/** A stored `advisories` value made safe to read: whatever is not a usable advisory is left out. */
export function normaliseAdvisories(value: unknown): StoredAdvisory[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normaliseAdvisory).filter((advisory) => advisory !== null);
}
