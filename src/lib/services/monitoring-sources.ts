import {eq, max} from 'drizzle-orm';
import {
  END_OF_SUPPORT_SOURCE,
  MONITORING_SOURCE_ID,
  MONITORING_SOURCE_STATUS,
  NPM_REGISTRY_URL,
  OSV_API_URL,
  type MonitoringSourceStatus,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {appDependencies, appHosting} from '@/lib/db/schema';
import {HOSTING_CATALOG, type StatusFeed} from '@/lib/hosting-catalog';

export type MonitoringSource = {
  id: string;
  name: string;
  monitors: string;
  status: MonitoringSourceStatus;
  lastRefreshedAt: string | null;
  url: string;
};

/**
 * Every outside source the app actually calls for dependency and hosting
 * monitoring. Keyless sources wired in code are `configured` until a check
 * has stored a time, then `reachable`. Nothing unimplemented is listed.
 */
export async function listMonitoringSources(
  db: AppDatabase,
  workspaceId: string,
): Promise<MonitoringSource[]> {
  const dependencyLast = await latestTimestamp(
    db,
    () =>
      db
        .select({at: max(appDependencies.checkedAt)})
        .from(appDependencies)
        .where(eq(appDependencies.workspaceId, workspaceId)),
  );
  const hostingLast = await latestTimestamp(
    db,
    () =>
      db
        .select({at: max(appHosting.healthCheckedAt)})
        .from(appHosting)
        .where(eq(appHosting.workspaceId, workspaceId)),
  );

  const sources: MonitoringSource[] = [
    {
      id: MONITORING_SOURCE_ID.npmRegistry,
      name: 'npm registry',
      monitors: 'Latest package versions for application dependencies',
      status: statusFor(dependencyLast),
      lastRefreshedAt: dependencyLast,
      url: NPM_REGISTRY_URL,
    },
    {
      id: MONITORING_SOURCE_ID.osv,
      name: 'OSV.dev',
      monitors: 'Known advisories for package versions',
      status: statusFor(dependencyLast),
      lastRefreshedAt: dependencyLast,
      url: OSV_API_URL,
    },
    {
      id: MONITORING_SOURCE_ID.endOfLifeDate,
      name: END_OF_SUPPORT_SOURCE.endOfLifeDate,
      monitors: 'End-of-support dates for hosting services and runtimes',
      status: statusFor(hostingLast),
      lastRefreshedAt: hostingLast,
      url: 'https://endoflife.date',
    },
  ];

  for (const feed of uniqueStatusFeeds()) {
    sources.push({
      id: `status_${feed.kind}_${slug(feed.name)}`,
      name: feed.name,
      monitors: `Open incidents and maintenance for ${providerNameFor(feed)}`,
      status: statusFor(hostingLast),
      lastRefreshedAt: hostingLast,
      url: feed.page,
    });
  }

  return sources;
}

function uniqueStatusFeeds(): StatusFeed[] {
  const seen = new Set<string>();
  const feeds: StatusFeed[] = [];
  for (const provider of HOSTING_CATALOG) {
    if (!provider.statusFeed || seen.has(provider.statusFeed.url)) {
      continue;
    }
    seen.add(provider.statusFeed.url);
    feeds.push(provider.statusFeed);
  }
  return feeds;
}

function providerNameFor(feed: StatusFeed): string {
  const provider = HOSTING_CATALOG.find((entry) => entry.statusFeed?.url === feed.url);
  return provider?.name ?? feed.name;
}

function statusFor(lastRefreshedAt: string | null): MonitoringSourceStatus {
  return lastRefreshedAt ? MONITORING_SOURCE_STATUS.reachable : MONITORING_SOURCE_STATUS.configured;
}

async function latestTimestamp(
  _db: AppDatabase,
  query: () => Promise<{at: Date | null}[]>,
): Promise<string | null> {
  const [row] = await query();
  return row?.at ? row.at.toISOString() : null;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
