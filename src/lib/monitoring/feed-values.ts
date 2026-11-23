import {FEED_MAX_NAMES, FEED_NAME_MAX_LENGTH, HTTPS_PROTOCOL, INCIDENT_URL_MAX_LENGTH} from '@/lib/constants';

/**
 * Readers for values that come from an outside feed. Nothing a feed says is
 * trusted: a wrong type throws (the feed counts as unreadable, so it can never
 * replace a good earlier result), and text is cleaned and cut before it is kept.
 */

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/g;

export function malformed(): Error {
  return new Error('Feed answered in an unexpected shape');
}

/**
 * Text made safe to store and show: control characters become spaces, it is cut
 * to `max` characters, and a character cut in half is replaced (the database
 * refuses NUL and half characters in JSON).
 */
export function cleanText(value: string, max: number): string {
  return value.replace(CONTROL_CHARACTERS, ' ').trim().slice(0, max).toWellFormed();
}

/** A feed value that must be text. */
export function feedText(value: unknown, max: number = FEED_NAME_MAX_LENGTH): string {
  if (typeof value !== 'string') {
    throw malformed();
  }
  return cleanText(value, max);
}

/** A feed value that must be a list. */
export function feedList(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw malformed();
  }
  return value;
}

/** A list of names (services, regions) from a feed: the first FEED_MAX_NAMES, blanks left out. */
export function feedNames(values: unknown, nameOf: (item: unknown) => unknown): string[] {
  return feedList(values)
    .slice(0, FEED_MAX_NAMES)
    .map((item) => feedText(nameOf(item)))
    .filter((name) => name !== '');
}

/** A time from a feed as an ISO timestamp, or null when it is not a time. */
export function isoTime(value: unknown): string | null {
  const time = typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * `url` when it is a plain `https:` link on the same host as `page` (the
 * provider's own status page); otherwise null, so a feed can never plant a
 * link to somewhere else.
 */
export function linkOnHostOf(page: string, url: unknown): string | null {
  if (typeof url !== 'string' || url.length > INCIDENT_URL_MAX_LENGTH || !URL.canParse(url)) {
    return null;
  }
  const link = new URL(url);
  const isOnHost = link.protocol === HTTPS_PROTOCOL && link.host === new URL(page).host && link.username === '' && link.password === '';
  return isOnHost ? link.href : null;
}
