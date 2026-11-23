import {END_OF_LIFE_API, findProvider} from '@/lib/hosting-catalog';
import type {Fetch} from '@/lib/services/package-sources';
import {createFetchText, type FetchText} from '../http';

/**
 * Test-only: small, fictional copies of each source's real response shape
 * (copied from the live feeds in Nov 2026), and a fake `fetch` that serves them.
 */

const feedUrl = (provider: string) => findProvider(provider)!.statusFeed!.url;

export const FEED_URL = {
  azure: feedUrl('Azure'),
  aws: feedUrl('AWS'),
  googleCloud: feedUrl('Google Cloud'),
  vercel: feedUrl('Vercel'),
  cloudflare: feedUrl('Cloudflare'),
  netlify: feedUrl('Netlify'),
};

/** The provider's own status page, where its incident links must point. */
export const statusPage = (provider: string) => findProvider(provider)!.statusFeed!.page;

export const endOfLifeUrlFor = (product: string) => `${END_OF_LIFE_API}/${product}`;

type Release = {name: string; label?: string; eolFrom: string | null};

/** endoflife.date `GET /api/v1/products/<product>`. */
export function endOfLifeDocument(releases: Release[]): string {
  return JSON.stringify({
    schema_version: '1.2.0',
    result: {
      name: 'product',
      releases: releases.map((release) => ({label: release.name, isEol: false, isMaintained: true, ...release})),
    },
  });
}

export const POSTGRES_ON_AZURE = endOfLifeDocument([
  {name: '16', eolFrom: '2028-11-09'},
  {name: '14', eolFrom: '2027-01-31'},
  {name: '12', eolFrom: '2026-07-31'},
]);

export const NODEJS = endOfLifeDocument([
  {name: '24', eolFrom: '2028-04-30'},
  {name: '22', eolFrom: '2027-04-30'},
  {name: '18', eolFrom: '2025-04-30'},
]);

type StatuspageEntry = {name: string; impact: string; components: string[]; scheduledFor?: string; id?: string};

/** Atlassian Statuspage `GET /api/v2/summary.json`. */
export function statuspageSummary(incidents: StatuspageEntry[], maintenances: StatuspageEntry[] = []): string {
  const entry = (item: StatuspageEntry, index: number) => ({
    id: item.id ?? `inc${index}`,
    name: item.name,
    status: item.scheduledFor ? 'scheduled' : 'identified',
    impact: item.impact,
    shortlink: `https://status.example.test/incidents/${item.name.length}${index}`,
    started_at: '2026-11-20T08:15:00.000Z',
    resolved_at: null,
    scheduled_for: item.scheduledFor,
    components: item.components.map((name) => ({id: name, name, status: 'degraded_performance'})),
  });
  return JSON.stringify({
    page: {id: 'page'},
    status: {indicator: 'minor', description: 'Partially Degraded Service'},
    components: [],
    incidents: incidents.map(entry),
    scheduled_maintenances: maintenances.map(entry),
  });
}

export const ALL_CLEAR = statuspageSummary([]);

/** AWS Health `GET /public/currentevents`: only open events are listed. */
export function awsCurrentEvents(events: {region: string; status: string; service: string; impacted: string[]}[]): string {
  return JSON.stringify(
    events.map((event) => ({
      date: '1795161600',
      arn: `arn:aws:health:${event.region}::event/MULTIPLE_SERVICES/AWS_MULTIPLE_SERVICES_OPERATIONAL_ISSUE/EXAMPLE`,
      region_name: 'Example region',
      status: event.status,
      service: `multipleservices-${event.region}`,
      service_name: event.service,
      summary: 'Increased error rates',
      event_log: [],
      impacted_services: Object.fromEntries(
        event.impacted.map((name, index) => [`svc${index}-${event.region}`, {service_name: name, current: event.status, max: event.status}]),
      ),
    })),
  );
}

type GoogleEntry = {description: string; impact: string; products: string[]; locations: string[]; end?: string};

/** Google Cloud `GET /incidents.json`: recent incidents; open ones have no `end`. */
export function googleCloudIncidents(incidents: GoogleEntry[]): string {
  return JSON.stringify(
    incidents.map((incident, index) => ({
      id: `g${index}`,
      begin: '2026-11-21T06:00:00+00:00',
      end: incident.end,
      external_desc: incident.description,
      status_impact: incident.impact,
      severity: 'medium',
      uri: `incidents/g${index}`,
      affected_products: incident.products.map((title) => ({title, id: title})),
      currently_affected_locations: incident.locations.map((id) => ({title: id, id})),
      previously_affected_locations: [],
    })),
  );
}

/** Azure status RSS: one `<item>` per open incident, none when all is well. */
export function azureStatusRss(items: {title: string; description: string; link?: string}[]): string {
  const entries = items
    .map(
      (item) => `<item><title>${item.title}</title><link>${item.link ?? 'https://azure.status.microsoft/en-us/status/'}</link>` +
        `<pubDate>Sat, 21 Nov 2026 09:30:00 Z</pubDate><description><![CDATA[<p>${item.description}</p>]]></description></item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Azure Status</title>${entries}</channel></rss>`;
}

/**
 * A fake network: serves `bodies` by URL, throws for an `Error` body, answers
 * 404 for an unknown URL, and remembers every URL asked for. `fetchText` is the
 * real reader (timeout, size cap, decoding) on top of the fake `fetch`.
 */
export function fakeFeeds(bodies: Record<string, string | Error>): {fetch: Fetch; fetchText: FetchText; requested: string[]} {
  const requested: string[] = [];
  const fetch: Fetch = async (url) => {
    requested.push(url);
    const body = bodies[url];
    if (body instanceof Error) {
      throw body;
    }
    return body === undefined ? new Response('Not found', {status: 404}) : new Response(body);
  };
  return {requested, fetch, fetchText: createFetchText(fetch)};
}
