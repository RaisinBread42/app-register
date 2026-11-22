import {END_OF_LIFE_API} from '@/lib/hosting-catalog';
import {isIsoDateOnly} from '@/lib/notice-alerts';

/** endoflife.date v1: one keyless JSON document per product, with a row per release. */

type Release = {name: string; label: string | null; eolFrom: string | null};

export function endOfLifeUrl(product: string): string {
  return `${END_OF_LIFE_API}/${encodeURIComponent(product)}`;
}

/**
 * The end-of-support date of `version` in an endoflife.date product document,
 * or null when the release is unknown or has no announced date.
 */
export function endOfSupportDate(document: string, version: string): string | null {
  const releases: Release[] = JSON.parse(document).result.releases;
  const date = findRelease(releases, version)?.eolFrom;
  return date && isIsoDateOnly(date) ? date : null;
}

/**
 * Matches what a person types to a release: "12", "v12" and "12.4" are release
 * `12`; "2022" is SQL Server's release labelled "2022 'Dallas'".
 */
function findRelease(releases: Release[], version: string): Release | undefined {
  const wanted = version.trim().toLowerCase().replace(/^v(?=\d)/, '');
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
