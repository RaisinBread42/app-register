import {
  ADVISORY_ID_MAX_LENGTH,
  ADVISORY_MAX_ALIASES,
  ADVISORY_SEVERITIES,
  ADVISORY_SEVERITY,
  ADVISORY_SUMMARY_MAX_LENGTH,
  OSV_ADVISORY_PAGE_URL,
  type AdvisorySeverity,
} from '@/lib/constants';

/**
 * The one shape an advisory may have before it is stored. Advisories come from
 * an outside source, so nothing is trusted: a wrong type is dropped or replaced,
 * long text is cut, and the link is always built from the id so it can only
 * point at OSV.
 */

/** One known security advisory for a dependency's tracked version. */
export type Advisory = {
  id: string;
  /** Other ids for the same advisory (e.g. the CVE for a GHSA). */
  aliases: string[];
  severity: AdvisorySeverity;
  summary: string;
  url: string;
};

/** What Postgres refuses in text: NUL, and half of a surrogate pair. */
const NOT_STORABLE = /[\p{Cs}\0]/gu;

/**
 * Text cut to `maxLength` that the database will accept. A cut that lands
 * inside a surrogate pair (an emoji, say) drops the half that is left.
 */
export function storableText(text: string, maxLength: number): string {
  return text.slice(0, maxLength).replace(NOT_STORABLE, '');
}

/** True for an id worth storing: text, not blank, not absurdly long, nothing the database refuses. */
export function isAdvisoryId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && storableText(value, ADVISORY_ID_MAX_LENGTH) === value;
}

/** The link to an advisory, always on OSV whatever the id says. */
export function advisoryUrl(id: string): string {
  return `${OSV_ADVISORY_PAGE_URL}/${encodeURIComponent(id)}`;
}

/** The advisory as it may be stored and shown, or null when it has no usable id. */
export function normaliseAdvisory(value: unknown): Advisory | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const {id, aliases, severity, summary} = value as Record<string, unknown>;
  if (!isAdvisoryId(id)) {
    return null;
  }
  return {
    id,
    aliases: Array.isArray(aliases) ? [...new Set(aliases.filter(isAdvisoryId))].slice(0, ADVISORY_MAX_ALIASES) : [],
    severity: (ADVISORY_SEVERITIES as readonly unknown[]).includes(severity)
      ? (severity as AdvisorySeverity)
      : ADVISORY_SEVERITY.unknown,
    summary: typeof summary === 'string' ? storableText(summary, ADVISORY_SUMMARY_MAX_LENGTH) : '',
    url: advisoryUrl(id),
  };
}
