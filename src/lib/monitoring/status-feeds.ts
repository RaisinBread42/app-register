import {
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  STATUS_FEED_KIND,
  type IncidentImpact,
  type IncidentScope,
} from '@/lib/constants';
import {squash, type StatusFeed} from '@/lib/hosting-catalog';

/**
 * Reads each provider's public status feed into one shape, and decides whether
 * an incident reaches a hosting row. Shapes were copied from the live feeds
 * (Nov 2026); a feed that changes shape throws here and is reported as a
 * failed source, never as "all clear".
 */

export type FeedIncident = {
  title: string;
  url: string;
  startedAt: string | null;
  impact: IncidentImpact;
  /** Service or component names the feed lists as affected; empty when it lists none. */
  services: string[];
  /** Region codes the feed lists as affected; empty when it lists none or says "global". */
  regions: string[];
  /** Free text to search when the feed has no lists (Azure's RSS). */
  text: string | null;
};

/** Every incident that is open now (and maintenance that is announced), in the feed's order. */
export function parseStatusFeed(feed: StatusFeed, body: string): FeedIncident[] {
  switch (feed.kind) {
    case STATUS_FEED_KIND.statuspage:
      return parseStatuspage(JSON.parse(body));
    case STATUS_FEED_KIND.gcpIncidents:
      return parseGoogleCloud(JSON.parse(body), feed.page);
    case STATUS_FEED_KIND.awsHealth:
      return parseAws(JSON.parse(body), feed.page);
    case STATUS_FEED_KIND.azureRss:
      return parseAzureRss(body, feed.page);
  }
}

// Atlassian Statuspage `summary.json` (Vercel, Cloudflare, Netlify, GitHub).

type StatuspageIncident = {
  name: string;
  impact: string;
  shortlink: string;
  started_at: string | null;
  scheduled_for?: string;
  components: {name: string}[];
};

const STATUSPAGE_MAJOR = ['major', 'critical'];

function parseStatuspage(summary: {incidents: StatuspageIncident[]; scheduled_maintenances: StatuspageIncident[]}): FeedIncident[] {
  const toIncident = (impact: (incident: StatuspageIncident) => IncidentImpact) => (incident: StatuspageIncident) => ({
    title: incident.name,
    url: incident.shortlink,
    startedAt: incident.scheduled_for ?? incident.started_at,
    impact: impact(incident),
    services: incident.components.map((component) => component.name),
    regions: [],
    text: null,
  });
  return [
    // `summary.json` lists unresolved incidents only.
    ...summary.incidents.map(
      toIncident((incident) => (STATUSPAGE_MAJOR.includes(incident.impact) ? INCIDENT_IMPACT.major : INCIDENT_IMPACT.minor)),
    ),
    ...summary.scheduled_maintenances.map(toIncident(() => INCIDENT_IMPACT.maintenance)),
  ];
}

// Google Cloud `incidents.json`: recent incidents, open ones have no `end`.

type GoogleIncident = {
  end?: string | null;
  begin: string;
  external_desc: string;
  uri: string;
  status_impact: string;
  affected_products: {title: string}[];
  currently_affected_locations: {id: string}[];
};

const GOOGLE_MAJOR = ['SERVICE_OUTAGE', 'SERVICE_DISRUPTION'];
const GLOBAL_REGION = 'global';

function parseGoogleCloud(incidents: GoogleIncident[], page: string): FeedIncident[] {
  return incidents
    .filter((incident) => !incident.end)
    .map((incident) => ({
      title: incident.external_desc,
      url: `${page}/${incident.uri}`,
      startedAt: incident.begin,
      impact: GOOGLE_MAJOR.includes(incident.status_impact) ? INCIDENT_IMPACT.major : INCIDENT_IMPACT.minor,
      services: incident.affected_products.map((product) => product.title),
      regions: incident.currently_affected_locations.map((location) => location.id).filter((id) => id !== GLOBAL_REGION),
      text: null,
    }));
}

// AWS Health `public/currentevents`: only events that are open now.

type AwsEvent = {
  date: string;
  arn: string;
  region_name: string;
  status: string;
  service_name: string;
  summary: string;
  impacted_services?: Record<string, {service_name: string}>;
};

/** AWS status levels: 1 informational, 2 degradation, 3 disruption. */
const AWS_DISRUPTION = '3';
/** `arn:aws:health:<region>::event/...` */
const AWS_ARN_REGION_INDEX = 3;
const MS_PER_SECOND = 1000;

function parseAws(events: AwsEvent[], page: string): FeedIncident[] {
  return events.map((event) => {
    const region = event.arn.split(':')[AWS_ARN_REGION_INDEX];
    return {
      title: `${event.service_name}: ${event.summary} (${event.region_name})`,
      url: page,
      startedAt: new Date(Number(event.date) * MS_PER_SECOND).toISOString(),
      impact: event.status === AWS_DISRUPTION ? INCIDENT_IMPACT.major : INCIDENT_IMPACT.minor,
      services: [event.service_name, ...Object.values(event.impacted_services ?? {}).map((service) => service.service_name)],
      regions: region && region !== GLOBAL_REGION ? [region] : [],
      text: null,
    };
  });
}

// Azure status RSS: one <item> per incident on the public status page, none when all is well.

function parseAzureRss(xml: string, page: string): FeedIncident[] {
  if (!xml.includes('<rss')) {
    throw new Error('Not an RSS feed');
  }
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const title = xmlText(item, 'title') ?? 'Azure incident';
    const published = Date.parse(xmlText(item, 'pubDate') ?? '');
    return {
      title,
      url: xmlText(item, 'link') ?? page,
      startedAt: Number.isNaN(published) ? null : new Date(published).toISOString(),
      // The public page only carries widespread incidents, and gives no severity.
      impact: INCIDENT_IMPACT.major,
      services: [],
      regions: [],
      text: `${title} ${xmlText(item, 'description') ?? ''}`,
    };
  });
}

/** The text of the first `<tag>` in an RSS item, without CDATA wrappers, markup or entities. */
function xmlText(item: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(item);
  if (!match) {
    return null;
  }
  const text = match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/** A region shorter than this ("us") would match almost any text. */
const MIN_REGION_LENGTH = 3;
/** "Azure Database for PostgreSQL" is four words; no service or region name is longer than this. */
const MAX_PHRASE_WORDS = 6;

/**
 * Whether `text` contains `phrase` as whole words, ignoring case, spaces and
 * punctuation: "Central US" and "central-us" mention `centralus`; "leaks" does not mention `AKS`.
 */
function mentions(text: string, phrase: string): boolean {
  const wanted = squash(phrase);
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((_, start) =>
    Array.from({length: MAX_PHRASE_WORDS}, (_, extra) => words.slice(start, start + extra + 1).join('')).includes(wanted),
  );
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
  const mentionsRegion = (text: string) => region !== null && mentions(text, region);
  const isRowService = (name: string) => components.some((component) => squash(component) === squash(name));

  const inService =
    listed(incident.services, row.components, (name) => isRowService(name) || mentionsRegion(name)) ??
    mentioned(incident.text, (text) => components.some((component) => mentions(text, component)));
  const inRegion = listed(incident.regions, region, mentionsRegion) ?? mentioned(incident.text, mentionsRegion);

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
function mentioned(text: string | null, matches: (text: string) => boolean): true | null {
  return text !== null && matches(text) ? true : null;
}
