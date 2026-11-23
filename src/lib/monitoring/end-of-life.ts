import {END_OF_LIFE_MAX_RELEASES} from '@/lib/constants';
import {END_OF_LIFE_API} from '@/lib/hosting-catalog';
import {isIsoDateOnly} from '@/lib/notice-alerts';
import {isPlainObject} from '@/lib/services/validation';
import {feedList, feedText, malformed} from './feed-values';

/**
 * endoflife.date v1: one keyless JSON document per product, with a row per
 * release. Nothing it says is trusted: a document that is not in that shape
 * throws (it counts as no answer), only the first END_OF_LIFE_MAX_RELEASES
 * releases are read, and a date is only used when it is a real calendar date.
 */

type Release = {name: string; label: string | null; eolFrom: string | null};

export function endOfLifeUrl(product: string): string {
  return `${END_OF_LIFE_API}/${encodeURIComponent(product)}`;
}

/** What endoflife.date says about one version of a product. */
export type EndOfSupport = {
  /** The end-of-support date, or null when the release is unknown or has no announced date. */
  date: string | null;
  /** The version named several releases with different dates; `date` is the earliest of them. */
  isVersionInexact: boolean;
};

/**
 * The end-of-support date of `version` in an endoflife.date product document.
 * A version that names several releases ("8" for MySQL 8.0 and 8.4) gets the
 * earliest of their dates, the cautious answer, and is flagged as inexact.
 */
export function endOfSupport(document: string, version: string): EndOfSupport {
  const dates = new Set(findReleases(readReleases(JSON.parse(document)), version).map((release) => release.eolFrom));
  const [earliest] = [...dates].filter((date) => date !== null).sort();
  return {date: earliest ?? null, isVersionInexact: dates.size > 1};
}

/** `endOfSupport(...).date`. */
export function endOfSupportDate(document: string, version: string): string | null {
  return endOfSupport(document, version).date;
}

function readReleases(document: unknown): Release[] {
  const result = isPlainObject(document) ? document.result : undefined;
  const releases = isPlainObject(result) ? result.releases : undefined;
  return feedList(releases).slice(0, END_OF_LIFE_MAX_RELEASES).map(readRelease);
}

function readRelease(release: unknown): Release {
  if (!isPlainObject(release)) {
    throw malformed();
  }
  const {label, eolFrom} = release;
  return {
    name: feedText(release.name),
    label: typeof label === 'string' ? feedText(label) : null,
    eolFrom: typeof eolFrom === 'string' && isIsoDateOnly(eolFrom) ? eolFrom : null,
  };
}

/** "SP3" in "2016 SP3", "sp3" in "13.0-sp3". */
const SERVICE_PACK = /(?:^|[^a-z0-9])sp(\d+)/;

/**
 * The releases a typed version names. Usually one: "12", "v12" and "12.4" are
 * release `12`; "2022" is SQL Server's release labelled "2022 'Dallas'".
 * Several when the version is not exact: "8" names MySQL `8.0` and `8.4`.
 * Service packs are the exception: of a product released in service packs, a
 * bare "2016" names the latest one ("2016 SP3"), the only one still supported.
 */
function findReleases(all: Release[], version: string): Release[] {
  const wanted = version.trim().toLowerCase().replace(/^v(?=\d)/, '');
  const releases = all.filter((release) => release.name !== '');
  if (!wanted) {
    return [];
  }
  const names = (release: Release) => [release.name, release.label ?? ''].map((name) => name.toLowerCase());
  const exact = releases.filter((release) => names(release).includes(wanted));
  // "2022" names the release "2022 'Dallas'"; "8" names "8.0" and "8.4".
  const starting = releases.filter((release) =>
    names(release).some((name) => name.startsWith(wanted) && /^[ .-]/.test(name.slice(wanted.length))),
  );

  const servicePack = (release: Release) => Math.max(...names(release).map((name) => Number(SERVICE_PACK.exec(name)?.[1] ?? -1)));
  const latestServicePack = Math.max(-1, ...[...exact, ...starting].map(servicePack));
  if (latestServicePack >= 0) {
    return [...exact, ...starting].filter((release) => servicePack(release) === latestServicePack);
  }
  if (exact.length > 0) {
    return exact;
  }
  // "12.4" belongs to release "12": the longest release name the version starts with.
  const [parent] = releases
    .filter((release) => wanted.startsWith(`${release.name.toLowerCase()}.`))
    .sort((a, b) => b.name.length - a.name.length);
  return parent ? [parent] : starting;
}
