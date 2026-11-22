import {STATUS_FEED_KIND, type StatusFeedKind} from './constants';

/**
 * The hosting providers and services the add-hosting dialog offers, and how each
 * one is monitored. Hand-kept and deliberately short: anything not listed can
 * still be typed as free text; it is just not monitored.
 *
 * - `statusFeed`: the provider's public, keyless status feed.
 * - `statusComponents`: what that feed calls the service, so an incident can be
 *   matched to it. Copied from the live feeds; without it only provider-wide
 *   notices reach the row.
 * - `eolProduct`: the endoflife.date product whose release table gives the
 *   end-of-support date for the row's version.
 * - `hasVersion` / `hasRuntime`: whether the dialog asks for a version or a runtime.
 */

export type CatalogService = {
  name: string;
  hasVersion?: boolean;
  hasRuntime?: boolean;
  eolProduct?: string;
  statusComponents?: string[];
};

export type StatusFeed = {kind: StatusFeedKind; name: string; url: string; page: string};

export type CatalogProvider = {
  name: string;
  /** Other spellings people type or send to the API. */
  aliases?: string[];
  statusFeed?: StatusFeed;
  services: CatalogService[];
};

export type CatalogRuntime = {name: string; aliases: string[]; eolProduct: string};

/** `https://endoflife.date/api/v1/products/<product>`: keyless, one JSON document per product. */
export const END_OF_LIFE_API = 'https://endoflife.date/api/v1/products';

/** Language runtimes an app service runs, tracked on endoflife.date. */
export const HOSTING_RUNTIMES: CatalogRuntime[] = [
  {name: 'Node.js', aliases: ['nodejs', 'node'], eolProduct: 'nodejs'},
  {name: 'Python', aliases: [], eolProduct: 'python'},
  {name: '.NET', aliases: ['dotnet', 'dotnet core'], eolProduct: 'dotnet'},
  {name: 'PHP', aliases: [], eolProduct: 'php'},
  {name: 'Ruby', aliases: [], eolProduct: 'ruby'},
  {name: 'Go', aliases: ['golang'], eolProduct: 'go'},
];

const statuspage = (name: string, host: string): StatusFeed => ({
  kind: STATUS_FEED_KIND.statuspage,
  name,
  url: `https://${host}/api/v2/summary.json`,
  page: `https://${host}`,
});

export const HOSTING_CATALOG: CatalogProvider[] = [
  {
    name: 'Azure',
    aliases: ['Microsoft Azure'],
    statusFeed: {
      kind: STATUS_FEED_KIND.azureRss,
      name: 'Azure status',
      url: 'https://rssfeed.azure.status.microsoft/en-us/status/feed/',
      page: 'https://azure.status.microsoft/en-us/status',
    },
    services: [
      {name: 'App Service', hasRuntime: true, statusComponents: ['App Service']},
      {name: 'Functions', hasRuntime: true, statusComponents: ['Azure Functions', 'Function App']},
      {name: 'Container Apps', hasRuntime: true, statusComponents: ['Container Apps']},
      {name: 'Static Web Apps', statusComponents: ['Static Web Apps']},
      {name: 'Kubernetes Service (AKS)', hasVersion: true, eolProduct: 'azure-kubernetes-service', statusComponents: ['Kubernetes Service', 'AKS']},
      {name: 'Virtual Machines', statusComponents: ['Virtual Machines']},
      {name: 'Database for PostgreSQL', hasVersion: true, eolProduct: 'azure-database-for-postgresql', statusComponents: ['Database for PostgreSQL']},
      {name: 'Database for MySQL', hasVersion: true, eolProduct: 'azure-database-for-mysql', statusComponents: ['Database for MySQL']},
      {name: 'SQL Database', statusComponents: ['SQL Database']},
      {name: 'SQL Server on Virtual Machines', hasVersion: true, eolProduct: 'mssqlserver', statusComponents: ['SQL Server on Azure Virtual Machines']},
      {name: 'Cosmos DB', statusComponents: ['Cosmos DB']},
      {name: 'Cache for Redis', hasVersion: true, eolProduct: 'redis', statusComponents: ['Cache for Redis']},
      {name: 'Storage', statusComponents: ['Azure Storage', 'Storage Accounts', 'Blob Storage']},
      {name: 'Container Registry', statusComponents: ['Container Registry']},
      {name: 'Key Vault', statusComponents: ['Key Vault']},
      {name: 'Front Door', statusComponents: ['Front Door']},
    ],
  },
  {
    name: 'AWS',
    aliases: ['Amazon Web Services', 'Amazon'],
    statusFeed: {
      kind: STATUS_FEED_KIND.awsHealth,
      name: 'AWS Health',
      url: 'https://health.aws.amazon.com/public/currentevents',
      page: 'https://health.aws.amazon.com/health/status',
    },
    services: [
      {name: 'EC2', statusComponents: ['Amazon Elastic Compute Cloud']},
      {name: 'ECS', statusComponents: ['Amazon Elastic Container Service']},
      {name: 'EKS', hasVersion: true, eolProduct: 'amazon-eks', statusComponents: ['Amazon Elastic Kubernetes Service']},
      {name: 'Lambda', hasRuntime: true, statusComponents: ['AWS Lambda']},
      {name: 'RDS for PostgreSQL', hasVersion: true, eolProduct: 'amazon-rds-postgresql', statusComponents: ['Amazon Relational Database Service']},
      {name: 'RDS for MySQL', hasVersion: true, eolProduct: 'amazon-rds-mysql', statusComponents: ['Amazon Relational Database Service']},
      {name: 'Aurora PostgreSQL', hasVersion: true, eolProduct: 'amazon-aurora-postgresql', statusComponents: ['Amazon Relational Database Service']},
      {name: 'DynamoDB', statusComponents: ['Amazon DynamoDB']},
      {name: 'ElastiCache for Redis', hasVersion: true, eolProduct: 'amazon-elasticache-redis', statusComponents: ['Amazon ElastiCache']},
      {name: 'S3', statusComponents: ['Amazon Simple Storage Service']},
      {name: 'CloudFront', statusComponents: ['Amazon CloudFront']},
      {name: 'Route 53', statusComponents: ['Amazon Route 53']},
      {name: 'ECR', statusComponents: ['Amazon Elastic Container Registry']},
    ],
  },
  {
    name: 'Google Cloud',
    aliases: ['GCP', 'Google Cloud Platform'],
    statusFeed: {
      kind: STATUS_FEED_KIND.gcpIncidents,
      name: 'Google Cloud status',
      url: 'https://status.cloud.google.com/incidents.json',
      page: 'https://status.cloud.google.com',
    },
    services: [
      {name: 'Cloud Run', hasRuntime: true, statusComponents: ['Cloud Run']},
      {name: 'Cloud Functions', hasRuntime: true, statusComponents: ['Cloud Run functions', 'Google Cloud Functions']},
      {name: 'App Engine', hasRuntime: true, statusComponents: ['Google App Engine']},
      {name: 'Compute Engine', statusComponents: ['Google Compute Engine']},
      {name: 'Kubernetes Engine (GKE)', hasVersion: true, eolProduct: 'google-kubernetes-engine', statusComponents: ['Google Kubernetes Engine']},
      {name: 'Cloud SQL for PostgreSQL', hasVersion: true, eolProduct: 'postgresql', statusComponents: ['Google Cloud SQL']},
      {name: 'Cloud SQL for MySQL', hasVersion: true, eolProduct: 'mysql', statusComponents: ['Google Cloud SQL']},
      {name: 'Cloud Storage', statusComponents: ['Google Cloud Storage']},
      {name: 'Firestore', statusComponents: ['Cloud Firestore']},
    ],
  },
  {
    name: 'Vercel',
    statusFeed: statuspage('Vercel status', 'www.vercel-status.com'),
    services: [
      {
        name: 'Hosting',
        hasRuntime: true,
        statusComponents: ['Builds', 'Functions', 'Routing Middleware', 'Image Optimization', 'Data Cache', 'Cron Jobs', 'TLS Certificates'],
      },
      {name: 'Blob', statusComponents: ['Blob']},
      {name: 'DNS & domains', statusComponents: ['DNS', 'Domain Registration']},
    ],
  },
  {
    name: 'Cloudflare',
    statusFeed: statuspage('Cloudflare status', 'www.cloudflarestatus.com'),
    services: [
      {name: 'CDN', statusComponents: ['CDN/Cache', 'Network']},
      {name: 'DNS', statusComponents: ['Authoritative DNS', 'DNS Updates']},
      {name: 'Workers', statusComponents: ['Workers', 'Workers KV', 'Durable Objects']},
      {name: 'Pages', statusComponents: ['Pages']},
      {name: 'R2', statusComponents: ['R2']},
      {name: 'D1', statusComponents: ['D1']},
      {name: 'Zero Trust', statusComponents: ['Zero Trust', 'Access', 'Tunnel']},
    ],
  },
  {
    name: 'Netlify',
    statusFeed: statuspage('Netlify status', 'www.netlifystatus.com'),
    services: [
      {
        name: 'Hosting',
        hasRuntime: true,
        statusComponents: ['Standard Edge Network', 'High-Performance Edge Network', 'Origin Servers', 'Build Pipeline'],
      },
      {name: 'Functions', hasRuntime: true, statusComponents: ['Netlify Functions', 'Edge Functions']},
      {name: 'DNS', statusComponents: ['Hosted DNS']},
    ],
  },
  {
    name: 'GitHub',
    statusFeed: statuspage('GitHub status', 'www.githubstatus.com'),
    services: [
      {name: 'Pages', statusComponents: ['Pages']},
      {name: 'Actions', statusComponents: ['Actions']},
      {name: 'Repositories', statusComponents: ['Git Operations', 'API Requests']},
      {name: 'Packages', statusComponents: ['Packages']},
    ],
  },
];

/** Compares names the way people type them: case, spaces and punctuation do not matter. */
export function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const named = (item: {name: string; aliases?: string[]}, text: string) =>
  [item.name, ...(item.aliases ?? [])].some((name) => squash(name) === squash(text));

export function findProvider(provider: string): CatalogProvider | undefined {
  return HOSTING_CATALOG.find((entry) => named(entry, provider));
}

/** The catalog entry for a provider's service; an "Azure " prefix on the service is ignored. */
export function findService(provider: string, service: string): CatalogService | undefined {
  const entry = findProvider(provider);
  const wanted = squash(service);
  return entry?.services.find((item) =>
    [item.name, `${entry.name} ${item.name}`].some((name) => squash(name) === wanted),
  );
}

export function findRuntime(runtime: string): CatalogRuntime | undefined {
  return HOSTING_RUNTIMES.find((entry) => named(entry, runtime));
}

/** The catalog as the API serves it: what the dialog needs, without feed URLs or matching details. */
export type HostingCatalogView = {
  providers: {
    name: string;
    isStatusMonitored: boolean;
    services: {name: string; hasVersion: boolean; hasRuntime: boolean; isEndOfSupportTracked: boolean}[];
  }[];
  runtimes: {name: string}[];
};

export function hostingCatalogView(): HostingCatalogView {
  return {
    providers: HOSTING_CATALOG.map((provider) => ({
      name: provider.name,
      isStatusMonitored: provider.statusFeed !== undefined,
      services: provider.services.map((service) => ({
        name: service.name,
        hasVersion: service.hasVersion ?? false,
        hasRuntime: service.hasRuntime ?? false,
        isEndOfSupportTracked: service.eolProduct !== undefined,
      })),
    })),
    runtimes: HOSTING_RUNTIMES.map((runtime) => ({name: runtime.name})),
  };
}
