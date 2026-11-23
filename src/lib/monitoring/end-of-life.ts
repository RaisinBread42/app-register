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

/**
 * The end-of-support date of `version` in an endoflife.date product document,
 * or null when the release is unknown or has no announced date.
 */
export function endOfSupportDate(document: string, version: string): string | null {
  return findRelease(readReleases(JSON.parse(document)), version)?.eolFrom ?? null;
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

/**
 * Matches what a person types to a release: "12", "v12" and "12.4" are release
 * `12`; "2022" is SQL Server's release labelled "2022 'Dallas'".
 */
function findRelease(all: Release[], version: string): Release | undefined {
  const wanted = version.trim().toLowerCase().replace(/^v(?=\d)/, '');
  const releases = all.filter((release) => release.name !== '');
  if (!wanted) {
    return undefined;
  }
  const names = (release: Release) => [release.name, release.label ?? ''].map((name) => name.toLowerCase());

  const exact = releases.find((release) => names(release).includes(wanted));
  if (exact) {
    return exact;
  }
  // "12.4" belongs to release "12": the longest release name the version starts with.
  const [parent] = releases
    .filter((release) => wanted.startsWith(`${release.name.toLowerCase()}.`))
    .sort((a, b) => b.name.length - a.name.length);
  if (parent) {
    return parent;
  }
  // "2022" names the release "2022 'Dallas'"; "8.0" names "8.0.46". The feed lists the newest first.
  return releases.find((release) =>
    names(release).some((name) => name.startsWith(wanted) && /^[ .-]/.test(name.slice(wanted.length))),
  );
}
