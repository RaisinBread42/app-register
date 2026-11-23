import {
  FEED_ITEM_MAX_LENGTH,
  FEED_MAX_INCIDENTS,
  FEED_MAX_TEXT_INCIDENTS,
  FEED_NAME_MAX_LENGTH,
  FEED_TEXT_MAX_LENGTH,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  INCIDENT_TITLE_MAX_LENGTH,
  INCIDENT_URL_MAX_LENGTH,
  STATUS_FEED_KIND,
  type IncidentImpact,
  type IncidentScope,
  type StatusFeedKind,
} from '@/lib/constants';
import {squash, statusComponentKeys, type StatusFeed} from '@/lib/hosting-catalog';
import {isPlainObject} from '@/lib/services/validation';
import {cleanText, feedList, feedNames, feedText, isoTime, linkOnHostOf, malformed} from './feed-values';
import {azureRegionsNamed, rowRegion, words, type RegionAliases} from './regions';

/**
 * Reads each provider's public status feed into one shape, and decides whether
 * an incident reaches a hosting row. Shapes were copied from the live feeds
 * (Nov 2026). Nothing a feed says is trusted: a feed that is not in its
 * documented shape throws here and is reported as a failed source, never as
 * "all clear"; text is cleaned and cut; at most FEED_MAX_INCIDENTS incidents are
 * read (FEED_MAX_TEXT_INCIDENTS from a free-text feed); and a link is only kept
 * when it points at the provider's own status page.
 *
 * Everything a row is later matched against is worked out here, once per feed:
 * which catalog services each incident lists (its whole list is read, however
 * long, and only the matches are kept) and which regions it names. Matching a
 * row to an incident is then a few lookups, however large the feed was.
 */

export type FeedIncident = {
  title: string;
  /** A link on the provider's own status host, or null when the feed gave none. */
  url: string | null;
  startedAt: string | null;
  impact: IncidentImpact;
  kind: StatusFeedKind;
  /** False when the feed lists no affected services for the incident, so it cannot say which are affected. */
  listsServices: boolean;
  /** Of the services the feed lists as affected, the ones the catalog knows for this provider (squashed names). */
  services: ReadonlySet<string>;
  /** Keys of the regions the feed lists or names (see `regions.ts`); empty when it names none or says "global". */
  regions: ReadonlySet<string>;
  /** Other spellings this feed gives for regions (display names), by key; shared by all its incidents. */
  regionAliases: RegionAliases;
  /** Statuspage: the listed component names as one text, where a place may be named ("Brussels, Belgium - (BRU)"). */
  componentText: string;
  /** Free-text feeds (Azure's RSS): the word runs of the text, to search for service names. See `phrasesIn`. */
  phrases: ReadonlySet<string> | null;
};

/** Every incident that is open now (and maintenance that is announced), in the feed's order. */
export function parseStatusFeed(feed: StatusFeed, body: string): FeedIncident[] {
  switch (feed.kind) {
    case STATUS_FEED_KIND.statuspage:
      return parseStatuspage(JSON.parse(body), feed);
    case STATUS_FEED_KIND.gcpIncidents:
      return parseGoogleCloud(JSON.parse(body), feed);
    case STATUS_FEED_KIND.awsHealth:
      return parseAws(JSON.parse(body), feed);
    case STATUS_FEED_KIND.azureRss:
      return parseAzureRss(body, feed);
  }
}

/** For a feed that names no regions. */
const NO_REGIONS: ReadonlySet<string> = new Set();
const NO_ALIASES: RegionAliases = new Map();

/** The first FEED_MAX_INCIDENTS entries of a feed's list, each of which must be an object. */
function entries(value: unknown): Record<string, unknown>[] {
  return feedList(value)
    .slice(0, FEED_MAX_INCIDENTS)
    .map((entry) => {
      if (!isPlainObject(entry)) {
        throw malformed();
      }
      return entry;
    });
}

const nameOf = (key: string) => (item: unknown) => (isPlainObject(item) ? item[key] : undefined);

/** Of all the names a feed lists as affected, the ones the catalog knows: the list is read whole, only the matches are kept. */
function knownAmong(names: string[], known: Set<string>): Set<string> {
  return new Set(names.map(squash).filter((name) => known.has(name)));
}

function title(value: unknown): string {
  const text = feedText(value, INCIDENT_TITLE_MAX_LENGTH);
  if (text === '') {
    throw malformed();
  }
  return text;
}

// Atlassian Statuspage `summary.json` (Vercel, Cloudflare, Netlify, GitHub).

const STATUSPAGE_MAJOR = ['major', 'critical'];
/** Statuspage ids are short codes; the incident's page is `<status page>/incidents/<id>`. */
const STATUSPAGE_ID = /^[a-z0-9]{1,40}$/i;
const NAME_SEPARATOR = ' | ';

function parseStatuspage(summary: unknown, feed: StatusFeed): FeedIncident[] {
  if (!isPlainObject(summary)) {
    throw malformed();
  }
  const known = statusComponentKeys(feed);
  const toIncident = (impact: (incident: Record<string, unknown>) => IncidentImpact) => (incident: Record<string, unknown>) => {
    const components = feedNames(incident.components, nameOf('name'));
    return {
      title: title(incident.name),
      // Built from the id, not taken from the feed's own link (a shortener on another host).
      url: typeof incident.id === 'string' && STATUSPAGE_ID.test(incident.id) ? `${feed.page}/incidents/${incident.id}` : null,
      startedAt: isoTime(incident.scheduled_for) ?? isoTime(incident.started_at),
      impact: impact(incident),
      kind: feed.kind,
      listsServices: components.length > 0,
      services: knownAmong(components, known),
      regions: NO_REGIONS,
      regionAliases: NO_ALIASES,
      componentText: ` ${components.map((name) => words(name).join(' ')).join(NAME_SEPARATOR)} `,
      phrases: null,
    };
  };
  return [
    // `summary.json` lists unresolved incidents only.
    ...entries(summary.incidents).map(
      toIncident((incident) => (STATUSPAGE_MAJOR.includes(feedText(incident.impact)) ? INCIDENT_IMPACT.major : INCIDENT_IMPACT.minor)),
    ),
    ...entries(summary.scheduled_maintenances).map(toIncident(() => INCIDENT_IMPACT.maintenance)),
  ];
}

// Google Cloud `incidents.json`: recent incidents, open ones have no `end`.

const GOOGLE_MAJOR = ['SERVICE_OUTAGE', 'SERVICE_DISRUPTION'];
const GLOBAL_REGION = 'global';

function parseGoogleCloud(incidents: unknown, feed: StatusFeed): FeedIncident[] {
  const known = statusComponentKeys(feed);
  const aliases = new Map<string, string>();
  const open = feedList(incidents).filter((incident) => isPlainObject(incident) && !incident.end);
  return entries(open).map((incident) => {
    const products = feedNames(incident.affected_products, nameOf('title'));
    const locations = feedList(incident.currently_affected_locations).map((location) => ({
      id: feedText(nameOf('id')(location)),
      title: nameOf('title')(location),
    }));
    const regions = new Set<string>();
    for (const {id, title: displayName} of locations.filter((location) => location.id !== '' && location.id !== GLOBAL_REGION)) {
      regions.add(addRegion(aliases, id, displayName));
    }
    return {
      title: title(incident.external_desc),
      url: linkOnHostOf(feed.page, `${feed.page}/${feedText(incident.uri)}`),
      startedAt: isoTime(incident.begin),
      impact: GOOGLE_MAJOR.includes(feedText(incident.status_impact)) ? INCIDENT_IMPACT.major : INCIDENT_IMPACT.minor,
      kind: feed.kind,
      listsServices: products.length > 0,
      services: knownAmong(products, known),
      regions,
      regionAliases: aliases,
      componentText: '',
      phrases: null,
    };
  });
}

// AWS Health `public/currentevents`: only events that are open now.

/** AWS status levels: 1 informational, 2 degradation, 3 disruption. */
const AWS_DISRUPTION = '3';
/** `arn:aws:health:<region>::event/...` */
const AWS_ARN_REGION_INDEX = 3;
const MS_PER_SECOND = 1000;

function parseAws(events: unknown, feed: StatusFeed): FeedIncident[] {
  const known = statusComponentKeys(feed);
  const aliases = new Map<string, string>();
  return entries(events).map((event) => {
    const region = feedText(event.arn).split(':')[AWS_ARN_REGION_INDEX];
    const regionName = feedText(event.region_name);
    const service = feedText(event.service_name);
    const impacted = Object.values(impactedServices(event.impacted_services ?? {}));
    return {
      title: title(`${service}: ${feedText(event.summary)} (${regionName})`),
      url: feed.page,
      startedAt: isoTime(Number(event.date) * MS_PER_SECOND),
      impact: String(event.status) === AWS_DISRUPTION ? INCIDENT_IMPACT.major : INCIDENT_IMPACT.minor,
      kind: feed.kind,
      listsServices: true,
      services: knownAmong([service, ...feedNames(impacted, nameOf('service_name'))], known),
      regions: new Set(region && region !== GLOBAL_REGION ? [addRegion(aliases, region, regionName)] : []),
      regionAliases: aliases,
      componentText: '',
      phrases: null,
    };
  });
}

function impactedServices(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw malformed();
  }
  return value;
}

/** A display name shorter than this ("US") says too little to stand for one region. */
const MIN_REGION_LENGTH = 3;

/**
 * The key of a region a feed lists by `code`. Its display name ("N. Virginia"),
 * when the feed gives one, is remembered so a row that records the name is
 * matched as well.
 */
function addRegion(aliases: Map<string, string>, code: string, displayName: unknown): string {
  const key = squash(code);
  aliases.set(key, key);
  const name = typeof displayName === 'string' ? squash(displayName) : '';
  if (name.length >= MIN_REGION_LENGTH) {
    aliases.set(name, key);
  }
  return key;
}

// Azure status RSS: one <item> per incident on the public status page, none when all is well.

const RSS_ITEM_OPEN = '<item>';
const RSS_ITEM_CLOSE = '</item>';
const AZURE_FALLBACK_TITLE = 'Azure incident';
const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';
/** A tag. It never spans another `<`, so a text full of unclosed `<` is still read in one pass. */
const MARKUP = /<[^<>]*>/g;

function parseAzureRss(xml: string, feed: StatusFeed): FeedIncident[] {
  if (!xml.includes('<rss')) {
    throw malformed();
  }
  // Split, not a pattern: an unclosed <item> in a huge document must not slow the check down.
  const items = xml
    .split(RSS_ITEM_OPEN)
    .slice(1, FEED_MAX_TEXT_INCIDENTS + 1)
    .map((rest) => rest.split(RSS_ITEM_CLOSE, 1)[0].slice(0, FEED_ITEM_MAX_LENGTH));
  return items.map((item) => {
    const heading = xmlText(item, 'title', INCIDENT_TITLE_MAX_LENGTH) ?? AZURE_FALLBACK_TITLE;
    const text = `${heading} ${xmlText(item, 'description', FEED_TEXT_MAX_LENGTH) ?? ''}`;
    return {
      title: heading,
      url: linkOnHostOf(feed.page, xmlText(item, 'link', INCIDENT_URL_MAX_LENGTH)) ?? feed.page,
      startedAt: isoTime(xmlText(item, 'pubDate', FEED_NAME_MAX_LENGTH)),
      // The public page only carries widespread incidents, and gives no severity.
      impact: INCIDENT_IMPACT.major,
      kind: feed.kind,
      listsServices: false,
      services: new Set<string>(),
      regions: azureRegionsNamed(text),
      regionAliases: NO_ALIASES,
      componentText: '',
      phrases: phrasesIn(text),
    };
  });
}

/** The text of the first `<tag>` in an RSS item, without CDATA wrappers, markup or entities. */
function xmlText(item: string, tag: string, max: number): string | null {
  const open = item.indexOf(`<${tag}`);
  const start = open < 0 ? -1 : item.indexOf('>', open);
  const end = start < 0 ? -1 : item.indexOf(`</${tag}>`, start);
  if (end < 0) {
    return null;
  }
  const text = item
    .slice(start + 1, end)
    .replaceAll(CDATA_OPEN, '')
    .replaceAll(CDATA_CLOSE, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(MARKUP, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  return cleanText(text, max) || null;
}

/** "Azure Database for PostgreSQL" is four words; no service name is longer than this. */
const MAX_PHRASE_WORDS = 6;

/**
 * Every run of one to MAX_PHRASE_WORDS whole words in `text`, lower-cased and
 * joined: "Key Vault" gives `key`, `vault` and `keyvault`. Built once per
 * text, so looking many service names up in a long text stays cheap, and only
 * whole words match: "leaks" does not mention `AKS`.
 */
function phrasesIn(text: string): Set<string> {
  const textWords = words(text);
  const phrases = new Set<string>();
  textWords.forEach((_, start) => {
    let phrase = '';
    for (const word of textWords.slice(start, start + MAX_PHRASE_WORDS)) {
      phrase += word;
      phrases.add(phrase);
    }
  });
  return phrases;
}

export type RowTarget = {
  /** What the provider's feed calls the row's service; undefined for free-text services. */
  components: string[] | undefined;
  region: string | null;
};

/**
 * How an incident reaches a hosting row, or null when it does not.
 *
 * - `service`: the feed names the row's service or its region, and no other region instead.
 * - `provider`: a notice, not an outage on the row. A major incident where the
 *   feed cannot say either way; one whose free text names other regions and not
 *   the row's; or one that names regions while the row's region is written in
 *   a way that cannot be compared with them.
 * - null: the feed's own lists say it is another service or region, or it is
 *   minor and cannot be tied to the row. Better to miss a minor notice than to cry wolf.
 */
export function incidentScope(incident: FeedIncident, row: RowTarget): IncidentScope | null {
  const region = rowRegion(incident.kind, row.region, incident.regionAliases);
  const namesRegions = incident.regions.size > 0;
  const inService = isRowService(incident, row);
  const inRegion = namesRegions && region.key !== null ? incident.regions.has(region.key) : null;
  const isMajor = incident.impact === INCIDENT_IMPACT.major;
  const notice = isMajor ? INCIDENT_SCOPE.provider : null;

  if (inService === false) {
    return null;
  }
  if (inRegion === false) {
    // A list of regions rules the row out. Free text does not, but it is no outage on a region it does not name.
    return incident.phrases === null ? null : notice;
  }
  if (namesRegions && region.isUnrecognised) {
    return inService ? INCIDENT_SCOPE.provider : notice;
  }
  return inService || inRegion ? INCIDENT_SCOPE.service : notice;
}

/** Whether the incident is on the row's service: yes, no (the feed lists others), or null when the feed cannot say. */
function isRowService(incident: FeedIncident, row: RowTarget): boolean | null {
  const components = (row.components ?? []).map(squash);
  if (incident.listsServices && row.components) {
    return components.some((component) => incident.services.has(component)) || namesPlace(incident.componentText, row.region);
  }
  // Free text can show the row is affected, never that it is not.
  return incident.phrases !== null && components.some((component) => incident.phrases?.has(component)) ? true : null;
}

/** Whether a Statuspage incident's component names mention the row's region as whole words: "BRU" in "Brussels, Belgium - (BRU)". */
function namesPlace(componentText: string, region: string | null): boolean {
  const place = words(region ?? '').join(' ');
  return squash(place).length >= MIN_REGION_LENGTH && componentText.includes(` ${place} `);
}
