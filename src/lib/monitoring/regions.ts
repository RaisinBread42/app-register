import {STATUS_FEED_KIND, type StatusFeedKind} from '@/lib/constants';
import {AZURE_REGIONS, squash} from '@/lib/hosting-catalog';

/**
 * Regions, reduced to one key per region so the region a person typed on a
 * hosting row can be compared with the regions a provider's feed names.
 * The key is the provider's own region code without punctuation: `useast1`,
 * `uscentral1`, `northcentralus`.
 */

/** AWS: `us-east-1`, `ap-southeast-2`, `us-gov-west-1`. An availability zone adds one letter: `us-east-1a`. */
const AWS_REGION = /^([a-z]{2}(?:-[a-z]+){1,2}-\d+)[a-z]?$/;
/** Google Cloud: `us-central1`, `europe-west4`. A zone adds a letter after a dash: `us-central1-a`. */
const GOOGLE_REGION = /^([a-z]+-[a-z]+\d+)(?:-[a-z])?$/;

/** How each provider writes a region code; the first group is the region without its zone. */
const REGION_CODE: Partial<Record<StatusFeedKind, RegExp>> = {
  [STATUS_FEED_KIND.awsHealth]: AWS_REGION,
  [STATUS_FEED_KIND.gcpIncidents]: GOOGLE_REGION,
};

/** Azure names its regions in prose ("North Central US"); the code is that name without spaces. */
const AZURE_REGION_KEYS = new Set(AZURE_REGIONS.map(squash));

/** Azure region names as word lists, by first word, longest first: "north central us" is tried before "north europe". */
const AZURE_REGIONS_BY_FIRST_WORD = new Map<string, string[][]>();
for (const name of [...AZURE_REGIONS].sort((a, b) => b.length - a.length)) {
  const regionWords = words(name);
  AZURE_REGIONS_BY_FIRST_WORD.set(regionWords[0], [...(AZURE_REGIONS_BY_FIRST_WORD.get(regionWords[0]) ?? []), regionWords]);
}

/** Other spellings of regions that one feed gives (display names such as "N. Virginia"), squashed, by region key. */
export type RegionAliases = ReadonlyMap<string, string>;

export type RowRegion = {
  /** The key of the row's region; null when the row records none, or one that cannot be recognised. */
  key: string | null;
  /** The row records a region, but not one this provider's feed could name: it cannot be compared with the feed's regions. */
  isUnrecognised: boolean;
};

/**
 * The region a person typed on a hosting row, as a key.
 * - A region code is recognised by its shape, and an availability zone is its region: `us-east-1a` is `us-east-1`.
 * - A display name is recognised when the feed itself gives it (`aliases`), or, for Azure, when it is in the catalog's list.
 * - A provider whose feed names no regions (Statuspage) has nothing to recognise.
 */
export function rowRegion(kind: StatusFeedKind, region: string | null, aliases: RegionAliases): RowRegion {
  const typed = region?.trim().toLowerCase() ?? '';
  if (typed === '' || kind === STATUS_FEED_KIND.statuspage) {
    return {key: null, isUnrecognised: false};
  }
  const code = REGION_CODE[kind]?.exec(typed)?.[1];
  const key = code ? squash(code) : (aliases.get(squash(typed)) ?? azureRegionKey(kind, typed));
  return {key, isUnrecognised: key === null};
}

function azureRegionKey(kind: StatusFeedKind, typed: string): string | null {
  const key = squash(typed);
  return kind === STATUS_FEED_KIND.azureRss && AZURE_REGION_KEYS.has(key) ? key : null;
}

/**
 * The Azure regions a text names, as keys. A region is matched by its full
 * name as whole words, the longest name first, and the words it used are not
 * matched again: "North Central US" is that region and never also "Central US";
 * "East US 2" is never also "East US". A region code on its own (`eastus2`) counts too.
 */
export function azureRegionsNamed(text: string): Set<string> {
  const textWords = words(text);
  const named = new Set<string>();
  let at = 0;
  while (at < textWords.length) {
    const candidates = AZURE_REGIONS_BY_FIRST_WORD.get(textWords[at]) ?? [];
    const region = candidates.find((regionWords) => regionWords.every((word, offset) => textWords[at + offset] === word));
    if (region) {
      named.add(region.join(''));
      at += region.length;
    } else {
      if (AZURE_REGION_KEYS.has(textWords[at])) {
        named.add(textWords[at]);
      }
      at += 1;
    }
  }
  return named;
}

/** The words of a text: lower-cased runs of letters and digits. */
export function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
