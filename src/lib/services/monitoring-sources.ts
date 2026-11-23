import {and, eq, isNotNull, isNull, max} from 'drizzle-orm';
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
 * monitoring. Status:
 * - reachable: at least one successful check is stored
 * - unavailable: checks have run but only failures are stored
 * - configured: wired and keyless, but nothing has been checked yet
 * Nothing unimplemented is listed.
 */
export async function listMonitoringSources(
  db: AppDatabase,
  workspaceId: string,
): Promise<MonitoringSource[]> {
  const dependency = await dependencyStatus(db, workspaceId);
  const hosting = await hostingStatus(db, workspaceId);

  const sources: MonitoringSource[] = [
    {
      id: MONITORING_SOURCE_ID.npmRegistry,
      name: 'npm registry',
      monitors: 'Latest package versions for application dependencies',
      status: dependency.status,
      lastRefreshedAt: dependency.lastRefreshedAt,
      url: NPM_REGISTRY_URL,
    },
    {
      id: MONITORING_SOURCE_ID.osv,
      name: 'OSV.dev',
      monitors: 'Known advisories for package versions',
      status: dependency.status,
      lastRefreshedAt: dependency.lastRefreshedAt,
      url: OSV_API_URL,
    },
    {
      id: MONITORING_SOURCE_ID.endOfLifeDate,
      name: END_OF_SUPPORT_SOURCE.endOfLifeDate,
      monitors: 'End-of-support dates for hosting services and runtimes',
      status: hosting.status,
      lastRefreshedAt: hosting.lastRefreshedAt,
      url: 'https://endoflife.date',
    },
  ];

  for (const feed of uniqueStatusFeeds()) {
    sources.push({
      id: `status_${feed.kind}_${slug(feed.name)}`,
      name: feed.name,
      monitors: `Open incidents and maintenance for ${providerNameFor(feed)}`,
      status: hosting.status,
      lastRefreshedAt: hosting.lastRefreshedAt,
      url: feed.page,
    });
  }

  return sources;
}

async function dependencyStatus(
  db: AppDatabase,
  workspaceId: string,
): Promise<{status: MonitoringSourceStatus; lastRefreshedAt: string | null}> {
  const [success] = await db
    .select({at: max(appDependencies.checkedAt)})
    .from(appDependencies)
    .where(eq(appDependencies.workspaceId, workspaceId));
  const lastRefreshedAt = success?.at ? success.at.toISOString() : null;
  if (lastRefreshedAt) {
    return {status: MONITORING_SOURCE_STATUS.reachable, lastRefreshedAt};
  }
  const [failed] = await db
    .select({id: appDependencies.id})
    .from(appDependencies)
    .where(and(eq(appDependencies.workspaceId, workspaceId), isNotNull(appDependencies.checkError)))
    .limit(1);
  if (failed) {
    return {status: MONITORING_SOURCE_STATUS.unavailable, lastRefreshedAt: null};
  }
  return {status: MONITORING_SOURCE_STATUS.configured, lastRefreshedAt: null};
}

async function hostingStatus(
  db: AppDatabase,
  workspaceId: string,
): Promise<{status: MonitoringSourceStatus; lastRefreshedAt: string | null}> {
  const [success] = await db
    .select({at: max(appHosting.healthCheckedAt)})
    .from(appHosting)
    .where(
      and(
        eq(appHosting.workspaceId, workspaceId),
        isNotNull(appHosting.healthCheckedAt),
        isNull(appHosting.healthError),
      ),
    );
  const lastRefreshedAt = success?.at ? success.at.toISOString() : null;
  if (lastRefreshedAt) {
    return {status: MONITORING_SOURCE_STATUS.reachable, lastRefreshedAt};
  }
  const [anyChecked] = await db
    .select({at: max(appHosting.healthCheckedAt)})
    .from(appHosting)
    .where(eq(appHosting.workspaceId, workspaceId));
  const [failed] = await db
    .select({id: appHosting.id})
    .from(appHosting)
    .where(and(eq(appHosting.workspaceId, workspaceId), isNotNull(appHosting.healthError)))
    .limit(1);
  if (failed) {
    return {
      status: MONITORING_SOURCE_STATUS.unavailable,
      lastRefreshedAt: anyChecked?.at ? anyChecked.at.toISOString() : null,
    };
  }
  return {status: MONITORING_SOURCE_STATUS.configured, lastRefreshedAt: null};
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

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
