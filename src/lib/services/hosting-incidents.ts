import {
  HOSTING_CHECK_ERROR_MAX_LENGTH,
  HOSTING_MAX_INCIDENTS,
  INCIDENT_IMPACTS,
  INCIDENT_SCOPES,
  INCIDENT_TITLE_MAX_LENGTH,
  type IncidentImpact,
  type IncidentScope,
} from '@/lib/constants';
import type {HostingIncident} from '@/lib/db/schema';
import {findProvider} from '@/lib/hosting-catalog';
import {cleanText, isoTime, linkOnHostOf} from '@/lib/monitoring/feed-values';
import {isPlainObject} from './validation';

/**
 * The one shape a stored incident may have, on the way into the database and on
 * the way out. Incidents come from an outside feed, so nothing is trusted: an
 * incident without a usable title, impact or scope is left out, long text is
 * cut, and the link is only kept when it is an `https:` page on the status host
 * the catalog lists for the row's provider.
 */

/** The incident as it may be stored and shown, or null when it is not usable. */
export function normaliseIncident(value: unknown, provider: string): HostingIncident | null {
  if (!isPlainObject(value) || typeof value.title !== 'string') {
    return null;
  }
  const title = cleanText(value.title, INCIDENT_TITLE_MAX_LENGTH);
  const {impact, scope} = value;
  if (title === '' || !isOneOf(INCIDENT_IMPACTS, impact) || !isOneOf(INCIDENT_SCOPES, scope)) {
    return null;
  }
  const page = findProvider(provider)?.statusFeed?.page;
  return {title, impact, scope, url: page ? linkOnHostOf(page, value.url) : null, startedAt: isoTime(value.startedAt)};
}

/** A stored `incidents` value made safe to read: at most HOSTING_MAX_INCIDENTS, whatever is not a usable incident left out. */
export function normaliseIncidents(value: unknown, provider: string): HostingIncident[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((incident) => normaliseIncident(incident, provider))
    .filter((incident) => incident !== null)
    .slice(0, HOSTING_MAX_INCIDENTS);
}

/** A stored `healthError` made safe to read: text, cut to its limit, or null. */
export function normaliseCheckError(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? cleanText(value, HOSTING_CHECK_ERROR_MAX_LENGTH) : null;
}

function isOneOf<T extends IncidentImpact | IncidentScope>(allowed: readonly T[], value: unknown): value is T {
  return (allowed as readonly unknown[]).includes(value);
}
