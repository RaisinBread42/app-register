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
} from '@/lib/constants';
import {squash, type StatusFeed} from '@/lib/hosting-catalog';
import {isPlainObject} from '@/lib/services/validation';
import {cleanText, feedList, feedNames, feedText, isoTime, linkOnHostOf, malformed} from './feed-values';

/**
 * Reads each provider's public status feed into one shape, and decides whether
 * an incident reaches a hosting row. Shapes were copied from the live feeds
 * (Nov 2026). Nothing a feed says is trusted: a feed that is not in its
 * documented shape throws here and is reported as a failed source, never as
 * "all clear"; text is cleaned and cut; at most FEED_MAX_INCIDENTS incidents are
 * read (FEED_MAX_TEXT_INCIDENTS from a free-text feed); and a link is only kept
 * when it points at the provider's own status page.
 */

export type FeedIncident = {
  title: string;
  /** A link on the provider's own status host, or null when the feed gave none. */
  url: string | null;
  startedAt: string | null;
  impact: IncidentImpact;
  /** Service or component names the feed lists as affected; empty when it lists none. */
  services: string[];
  /** Region codes the feed lists as affected; empty when it lists none or says "global". */
  regions: string[];
  /** The word runs of the feed's free text, to search when it has no lists (Azure's RSS). See `phrasesIn`. */
  phrases: Set<string> | null;
};

/** Every incident that is open now (and maintenance that is announced), in the feed's order. */
export function parseStatusFeed(feed: StatusFeed, body: string): FeedIncident[] {
  switch (feed.kind) {
    case STATUS_FEED_KIND.statuspage:
      return parseStatuspage(JSON.parse(body), feed.page);
    case STATUS_FEED_KIND.gcpIncidents:
      return parseGoogleCloud(JSON.parse(body), feed.page);
    case STATUS_FEED_KIND.awsHealth:
      return parseAws(JSON.parse(body), feed.page);
    case STATUS_FEED_KIND.azureRss:
      return parseAzureRss(body, feed.page);
  }
}

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

function parseStatuspage(summary: unknown, page: string): FeedIncident[] {
  if (!isPlainObject(summary)) {
    throw malformed();
  }
  const toIncident = (impact: (incident: Record<string, unknown>) => IncidentImpact) => (incident: Record<string, unknown>) => ({
    title: title(incident.name),
    // Built from the id, not taken from the feed's own link (a shortener on another host).
    url: typeof incident.id === 'string' && STATUSPAGE_ID.test(incident.id) ? `${page}/incidents/${incident.id}` : null,
    startedAt: isoTime(incident.scheduled_for) ?? isoTime(incident.started_at),
    impact: impact(incident),
    services: feedNames(incident.components, nameOf('name')),
    regions: [],
    phrases: null,
  });
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

function parseGoogleCloud(incidents: unknown, page: string): FeedIncident[] {
  const open = feedList(incidents).filter((incident) => isPlainObject(incident) && !incident.end);
  return entries(open).map((incident) => ({
    title: title(incident.external_desc),
    url: linkOnHostOf(page, `${page}/${feedText(incident.uri)}`),
    startedAt: isoTime(incident.begin),
    impact: GOOGLE_MAJOR.includes(feedText(incident.status_impact)) ? INCIDENT_IMPACT.major : INCIDENT_IMPACT.minor,
    services: feedNames(incident.affected_products, nameOf('title')),
    regions: feedNames(incident.currently_affected_locations, nameOf('id')).filter((id) => id !== GLOBAL_REGION),
    phrases: null,
  }));
}

// AWS Health `public/currentevents`: only events that are open now.

/** AWS status levels: 1 informational, 2 degradation, 3 disruption. */
const AWS_DISRUPTION = '3';
/** `arn:aws:health:<region>::event/...` */
const AWS_ARN_REGION_INDEX = 3;
const MS_PER_SECOND = 1000;

function parseAws(events: unknown, page: string): FeedIncident[] {
  return entries(events).map((event) => {
    const region = feedText(event.arn).split(':')[AWS_ARN_REGION_INDEX];
    const service = feedText(event.service_name);
    const impacted = Object.values(impactedServices(event.impacted_services ?? {}));
    return {
      title: title(`${service}: ${feedText(event.summary)} (${feedText(event.region_name)})`),
      url: page,
      startedAt: isoTime(Number(event.date) * MS_PER_SECOND),
      impact: String(event.status) === AWS_DISRUPTION ? INCIDENT_IMPACT.major : INCIDENT_IMPACT.minor,
      services: [service, ...feedNames(impacted, nameOf('service_name'))],
      regions: region && region !== GLOBAL_REGION ? [region] : [],
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

// Azure status RSS: one <item> per incident on the public status page, none when all is well.

const RSS_ITEM_OPEN = '<item>';
const RSS_ITEM_CLOSE = '</item>';
const AZURE_FALLBACK_TITLE = 'Azure incident';
const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';
/** A tag. It never spans another `<`, so a text full of unclosed `<` is still read in one pass. */
const MARKUP = /<[^<>]*>/g;

function parseAzureRss(xml: string, page: string): FeedIncident[] {
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
    return {
      title: heading,
      url: linkOnHostOf(page, xmlText(item, 'link', INCIDENT_URL_MAX_LENGTH)) ?? page,
      startedAt: isoTime(xmlText(item, 'pubDate', FEED_NAME_MAX_LENGTH)),
      // The public page only carries widespread incidents, and gives no severity.
      impact: INCIDENT_IMPACT.major,
      services: [],
      regions: [],
      phrases: phrasesIn(`${heading} ${xmlText(item, 'description', FEED_TEXT_MAX_LENGTH) ?? ''}`),
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

/** A region shorter than this ("us") would match almost any text. */
const MIN_REGION_LENGTH = 3;
/** "Azure Database for PostgreSQL" is four words; no service or region name is longer than this. */
const MAX_PHRASE_WORDS = 6;

/**
 * Every run of one to MAX_PHRASE_WORDS whole words in `text`, lower-cased and
 * joined: "Central US" gives `central`, `us` and `centralus`. Built once per
 * text, so matching many rows against a long text stays cheap.
 */
function phrasesIn(text: string): Set<string> {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const phrases = new Set<string>();
  words.forEach((_, start) => {
    let phrase = '';
    for (const word of words.slice(start, start + MAX_PHRASE_WORDS)) {
      phrase += word;
      phrases.add(phrase);
    }
  });
  return phrases;
}

/**
 * Whether the text behind `phrases` contains `phrase` as whole words, ignoring
 * case, spaces and punctuation: "Central US" and "central-us" mention
 * `centralus`; "leaks" does not mention `AKS`.
 */
function mentions(phrases: Set<string>, phrase: string): boolean {
  return phrases.has(squash(phrase));
}

export type RowTarget = {
  /** What the provider's feed calls the row's service; undefined for free-text services. */
  components: string[] | undefined;
  region: string | null;
};

/**
 * How an incident reaches a hosting row, or null when it does not.
 *
 * - `service`: the feed names the row's service or its region.
 * - `provider`: a major incident where the feed cannot say either way.
 * - null: the feed says it is another service or region, or it is minor and
 *   cannot be tied to the row. Better to miss a minor notice than to cry wolf.
 */
export function incidentScope(incident: FeedIncident, row: RowTarget): IncidentScope | null {
  const region = row.region && squash(row.region).length >= MIN_REGION_LENGTH ? row.region : null;
  const components = row.components ?? [];
  const mentionsRegion = (phrases: Set<string>) => region !== null && mentions(phrases, region);
  const namesRegion = (name: string) => mentionsRegion(phrasesIn(name));
  const isRowService = (name: string) => components.some((component) => squash(component) === squash(name));

  const inService =
    listed(incident.services, row.components, (name) => isRowService(name) || namesRegion(name)) ??
    mentioned(incident.phrases, (phrases) => components.some((component) => mentions(phrases, component)));
  const inRegion = listed(incident.regions, region, namesRegion) ?? mentioned(incident.phrases, mentionsRegion);

  if (inService === false || inRegion === false) {
    return null;
  }
  if (inService || inRegion) {
    return INCIDENT_SCOPE.service;
  }
  return incident.impact === INCIDENT_IMPACT.major ? INCIDENT_SCOPE.provider : null;
}

/** Whether a list the feed gives includes the row: yes, no, or null when there is nothing to compare. */
function listed(names: string[], known: unknown, matches: (name: string) => boolean): boolean | null {
  return names.length > 0 && known ? names.some(matches) : null;
}

/** Free text can show the row is affected, never that it is not. */
function mentioned(phrases: Set<string> | null, matches: (phrases: Set<string>) => boolean): true | null {
  return phrases !== null && matches(phrases) ? true : null;
}
