import {eq} from 'drizzle-orm';
import {
  DEPENDENCY_CHECK_ERROR,
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
 * monitoring. Each source gets its own status from the facts stored for it:
 * - reachable: evidence of a successful answer from that source
 * - unavailable: checks that involve it have only failed
 * - configured: wired and keyless, but nothing has been checked yet
 * Nothing unimplemented is listed.
 */
export async function listMonitoringSources(
  db: AppDatabase,
  workspaceId: string,
): Promise<MonitoringSource[]> {
  const deps = await db
    .select({
      latestVersion: appDependencies.latestVersion,
      checkedAt: appDependencies.checkedAt,
      checkError: appDependencies.checkError,
    })
    .from(appDependencies)
    .where(eq(appDependencies.workspaceId, workspaceId));

  const hosting = await db
    .select({
      provider: appHosting.provider,
      endOfSupportSource: appHosting.endOfSupportSource,
      healthCheckedAt: appHosting.healthCheckedAt,
      healthError: appHosting.healthError,
    })
    .from(appHosting)
    .where(eq(appHosting.workspaceId, workspaceId));

  const dependencyLast = maxIso(deps.map((row) => row.checkedAt));
  // A hosting run that failed still writes healthCheckedAt, so only clean rows count as an answer.
  const hostingLast = maxIso(hosting.filter((row) => row.healthError === null).map((row) => row.healthCheckedAt));

  const npmAnswered = deps.some((row) => row.latestVersion !== null || row.checkedAt !== null);
  const npmFailed = deps.some(
    (row) =>
      row.checkError === DEPENDENCY_CHECK_ERROR.unavailable ||
      row.checkError === DEPENDENCY_CHECK_ERROR.notFound,
  );
  const osvSucceeded = deps.some((row) => row.checkedAt !== null && row.checkError === null);
  const osvFailed = deps.some((row) => row.checkError === DEPENDENCY_CHECK_ERROR.unavailable);

  const eolAnswered = hosting.some(
    (row) => row.endOfSupportSource === END_OF_SUPPORT_SOURCE.endOfLifeDate,
  );
  const eolFailed = hosting.some(
    (row) => row.healthError !== null && /endoflife/i.test(row.healthError),
  );

  const sources: MonitoringSource[] = [
    {
      id: MONITORING_SOURCE_ID.npmRegistry,
      name: 'npm registry',
      monitors: 'Latest package versions for application dependencies',
      status: statusOf(npmAnswered, npmFailed && !npmAnswered),
      lastRefreshedAt: dependencyLast,
      url: NPM_REGISTRY_URL,
    },
    {
      id: MONITORING_SOURCE_ID.osv,
      name: 'OSV.dev',
      monitors: 'Known advisories for package versions',
      status: statusOf(osvSucceeded, osvFailed && !osvSucceeded),
      lastRefreshedAt: dependencyLast,
      url: OSV_API_URL,
    },
    {
      id: MONITORING_SOURCE_ID.endOfLifeDate,
      name: END_OF_SUPPORT_SOURCE.endOfLifeDate,
      monitors: 'End-of-support dates for hosting services and runtimes',
      status: statusOf(eolAnswered, eolFailed && !eolAnswered),
      lastRefreshedAt: hostingLast,
      url: 'https://endoflife.date',
    },
  ];

  for (const feed of uniqueStatusFeeds()) {
    const provider = providerNameFor(feed);
    const feedFailed = hosting.some(
      (row) => row.healthError !== null && feedErrorMentions(row.healthError, feed, provider),
    );
    // A clean health check is evidence the provider's feed answered; we do not
    // store which feed ran, so only mark this feed reachable when the row's
    // provider matches and there was no health error.
    const feedOk = hosting.some(
      (row) =>
        row.healthCheckedAt !== null &&
        row.healthError === null &&
        providerMatchesRow(row.provider ?? '', provider),
    );
    sources.push({
      id: `status_${feed.kind}_${slug(feed.name)}`,
      name: feed.name,
      monitors: `Open incidents and maintenance for ${provider}`,
      status: statusOf(feedOk && !feedFailed, feedFailed),
      lastRefreshedAt: hostingLast,
      url: feed.page,
    });
  }

  return sources;
}

function statusOf(succeeded: boolean, failedOnly: boolean): MonitoringSourceStatus {
  if (succeeded) {
    return MONITORING_SOURCE_STATUS.reachable;
  }
  if (failedOnly) {
    return MONITORING_SOURCE_STATUS.unavailable;
  }
  return MONITORING_SOURCE_STATUS.configured;
}

function feedErrorMentions(healthError: string, feed: StatusFeed, provider: string): boolean {
  const haystack = healthError.toLowerCase();
  return haystack.includes(feed.name.toLowerCase()) || haystack.includes(provider.toLowerCase());
}

function providerMatchesRow(rowProvider: string, catalogProvider: string): boolean {
  return rowProvider.toLowerCase() === catalogProvider.toLowerCase();
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

function maxIso(values: (Date | null)[]): string | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (value && (!latest || value.getTime() > latest.getTime())) {
      latest = value;
    }
  }
  return latest ? latest.toISOString() : null;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
