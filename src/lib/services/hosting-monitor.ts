import {and, eq} from 'drizzle-orm';
import {END_OF_SUPPORT_SOURCE, MONITOR_CONCURRENCY} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {appHosting, apps, type AppHostingRow, type HostingIncident} from '@/lib/db/schema';
import {findProvider, findRuntime, findService, type StatusFeed} from '@/lib/hosting-catalog';
import {endOfLifeUrl, endOfSupportDate} from '@/lib/monitoring/end-of-life';
import {fetchText as fetchFromNetwork, type FetchText} from '@/lib/monitoring/http';
import {incidentScope, parseStatusFeed, type FeedIncident} from '@/lib/monitoring/status-feeds';
import {activeAppsIn, assertActiveApp} from './app-scope';
import {addHosting, listHosting, updateHosting, type HostingInput, type HostingView} from './hosting';

/**
 * The hosting check: asks endoflife.date when each row's version or runtime
 * stops being supported, and each provider's public status feed for open
 * incidents, then stores the answers on the hosting rows.
 *
 * One run fetches each URL once, a few at a time. A source that fails is named
 * in the row's healthError and what the row already had from it is kept, so
 * one broken feed never fails the run or wipes earlier findings.
 */

export type RefreshOptions = {fetchText?: FetchText; now?: Date};

export type RefreshSummary = {apps: number; hosting: number; failedSources: string[]};

const REASON_MAX_LENGTH = 80;

/** Checks one active app's hosting rows now and returns them as stored. */
export async function refreshHostingHealth(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  options: RefreshOptions = {},
): Promise<HostingView[]> {
  await assertActiveApp(db, workspaceId, appId);
  const rows = await db
    .select()
    .from(appHosting)
    .where(and(eq(appHosting.workspaceId, workspaceId), eq(appHosting.appId, appId)));
  await checkRows(db, rows, options);
  return listHosting(db, workspaceId, appId);
}

/** Adds a hosting row and checks the app's hosting straight away, so the answer carries what was found. */
export async function addHostingAndCheck(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  input: HostingInput,
  options: RefreshOptions = {},
): Promise<HostingView> {
  const added = await addHosting(db, workspaceId, appId, input);
  return checkedRow(await refreshHostingHealth(db, workspaceId, appId, options), added);
}

export async function updateHostingAndCheck(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  id: string,
  patch: Partial<HostingInput>,
  options: RefreshOptions = {},
): Promise<HostingView> {
  const updated = await updateHosting(db, workspaceId, appId, id, patch);
  return checkedRow(await refreshHostingHealth(db, workspaceId, appId, options), updated);
}

function checkedRow(rows: HostingView[], saved: HostingView): HostingView {
  return rows.find((row) => row.id === saved.id) ?? saved;
}

/** Checks every hosting row of every active app in the workspace (the daily job). */
export async function refreshWorkspaceHostingHealth(
  db: AppDatabase,
  workspaceId: string,
  options: RefreshOptions = {},
): Promise<RefreshSummary> {
  const found = await db
    .select({row: appHosting})
    .from(appHosting)
    .innerJoin(apps, eq(apps.id, appHosting.appId))
    .where(activeAppsIn(workspaceId));
  const rows = found.map(({row}) => row);
  const failedSources = await checkRows(db, rows, options);
  return {apps: new Set(rows.map((row) => row.appId)).size, hosting: rows.length, failedSources};
}

type Failure = {error: string};
type Answer = {body: string} | Failure;
type Result<T> = {value: T} | Failure;

const isFailure = (outcome: object): outcome is Failure => 'error' in outcome;
type Lookup = {product: string; version: string};

/** Checks the rows and stores what it finds. Returns the sources that failed, each named once. */
async function checkRows(db: AppDatabase, rows: AppHostingRow[], options: RefreshOptions): Promise<string[]> {
  const {fetchText = fetchFromNetwork, now = new Date()} = options;
  const feeds = uniqueByUrl(rows.flatMap(statusFeed));
  const lookupUrls = rows.flatMap((row) => endOfLifeLookups(row).map(({product}) => endOfLifeUrl(product)));
  const answers = await fetchAll([...new Set([...feeds.map((feed) => feed.url), ...lookupUrls])], fetchText);
  // Each provider feed is parsed once per run, however many rows use it.
  const openByFeed = new Map(
    feeds.map((feed) => [feed.url, read(answers.get(feed.url), feed.name, (body) => parseStatusFeed(feed, body))]),
  );

  const failed = new Set<string>();
  for (const row of rows) {
    const errors: string[] = [];
    await db
      .update(appHosting)
      .set({
        ...endOfSupport(row, answers, errors),
        incidents: incidents(row, openByFeed, errors),
        healthCheckedAt: now,
        healthError: errors.length > 0 ? errors.join('; ') : null,
      })
      .where(eq(appHosting.id, row.id));
    errors.forEach((error) => failed.add(error));
  }
  return [...failed];
}

function uniqueByUrl(feeds: StatusFeed[]): StatusFeed[] {
  return [...new Map(feeds.map((feed) => [feed.url, feed])).values()];
}

/** Fetches each URL once, MONITOR_CONCURRENCY at a time. A failure is an answer, not an exception. */
async function fetchAll(urls: string[], fetchText: FetchText): Promise<Map<string, Answer>> {
  const answers = new Map<string, Answer>();
  for (let start = 0; start < urls.length; start += MONITOR_CONCURRENCY) {
    await Promise.all(
      urls.slice(start, start + MONITOR_CONCURRENCY).map(async (url) => {
        try {
          answers.set(url, {body: await fetchText(url)});
        } catch (error) {
          answers.set(url, {error: `could not be reached (${reason(error)})`});
        }
      }),
    );
  }
  return answers;
}

function reason(error: unknown): string {
  return (error instanceof Error ? error.message : 'unknown error').slice(0, REASON_MAX_LENGTH);
}

/** Parses a fetched body. A fetch failure or an unexpected format becomes an error that names the source. */
function read<T>(answer: Answer | undefined, source: string, parse: (body: string) => T): Result<T> {
  if (!answer || isFailure(answer)) {
    return {error: `${source} ${answer?.error ?? 'was not fetched'}`};
  }
  try {
    return {value: parse(answer.body)};
  } catch {
    return {error: `${source} sent an unexpected format`};
  }
}

function statusFeed(row: AppHostingRow): StatusFeed[] {
  const feed = findProvider(row.provider)?.statusFeed;
  return feed ? [feed] : [];
}

/** What to ask endoflife.date for a row: its service's version and its runtime's version, when the catalog knows them. */
function endOfLifeLookups(row: AppHostingRow): Lookup[] {
  const lookups: Lookup[] = [];
  const serviceProduct = findService(row.provider, row.service)?.eolProduct;
  if (serviceProduct && row.version) {
    lookups.push({product: serviceProduct, version: row.version});
  }
  const runtimeProduct = row.runtime ? findRuntime(row.runtime)?.eolProduct : undefined;
  if (runtimeProduct && row.runtimeVersion) {
    lookups.push({product: runtimeProduct, version: row.runtimeVersion});
  }
  return lookups;
}

/** The earliest end-of-support date found. A manual date, or a lookup that failed, leaves the row as it is. */
function endOfSupport(
  row: AppHostingRow,
  answers: Map<string, Answer>,
  errors: string[],
): Pick<AppHostingRow, 'endOfSupportOn' | 'endOfSupportSource'> {
  const unchanged = {endOfSupportOn: row.endOfSupportOn, endOfSupportSource: row.endOfSupportSource};
  if (row.endOfSupportSource === END_OF_SUPPORT_SOURCE.manual) {
    return unchanged;
  }
  const dates: string[] = [];
  for (const {product, version} of endOfLifeLookups(row)) {
    const found = read(answers.get(endOfLifeUrl(product)), END_OF_SUPPORT_SOURCE.endOfLifeDate, (body) => endOfSupportDate(body, version));
    if (isFailure(found)) {
      errors.push(found.error);
      return unchanged;
    }
    if (found.value) {
      dates.push(found.value);
    }
  }
  const [earliest] = dates.sort();
  return earliest
    ? {endOfSupportOn: earliest, endOfSupportSource: END_OF_SUPPORT_SOURCE.endOfLifeDate}
    : {endOfSupportOn: null, endOfSupportSource: null};
}

/** The open incidents that reach this row; what it had before when its provider's feed could not be read. */
function incidents(
  row: AppHostingRow,
  openByFeed: Map<string, Result<FeedIncident[]>>,
  errors: string[],
): HostingIncident[] {
  const [feed] = statusFeed(row);
  if (!feed) {
    return [];
  }
  const open = openByFeed.get(feed.url);
  if (!open || isFailure(open)) {
    errors.push(open?.error ?? `${feed.name} was not fetched`);
    return row.incidents;
  }
  const target = {components: findService(row.provider, row.service)?.statusComponents, region: row.region};
  return open.value.flatMap((incident) => {
    const scope = incidentScope(incident, target);
    return scope
      ? [{title: incident.title, impact: incident.impact, scope, url: incident.url, startedAt: incident.startedAt}]
      : [];
  });
}
