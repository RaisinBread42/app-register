import {and, eq, inArray, isNull, type SQL} from 'drizzle-orm';
import type {AnyPgColumn} from 'drizzle-orm/pg-core';
import {END_OF_SUPPORT_SOURCE, HOSTING_CHECK_ERROR_MAX_LENGTH, MONITORING_FOLLOW_UP_BUDGET_MS} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {appHosting, apps} from '@/lib/db/schema';
import {findProvider, findRuntime, findService, type StatusFeed} from '@/lib/hosting-catalog';
import {endOfLifeUrl, endOfSupportDate} from '@/lib/monitoring/end-of-life';
import {cleanText} from '@/lib/monitoring/feed-values';
import {createFetchText, type FetchText} from '@/lib/monitoring/http';
import {incidentScope, parseStatusFeed, type FeedIncident} from '@/lib/monitoring/status-feeds';
import {activeAppsIn, assertActiveApp} from './app-scope';
import {listHosting, type HostingView} from './hosting';
import {loadHosting, normaliseIncidents, replaceIncidents, type HostingIncident, type HostingRecord} from './hosting-incidents';
import {mapWithLimit} from './package-sources';

/**
 * The hosting check: asks endoflife.date when each row's version or runtime
 * stops being supported, and each provider's public status feed for open
 * incidents, then stores the answers on the hosting rows.
 *
 * One run fetches each URL once, a few at a time. A source that fails is named
 * in the row's healthError and what the row already had from it is kept, so
 * one broken feed never fails the run or wipes earlier findings. Nothing is
 * fetched inside a database transaction, and an answer is only stored while the
 * row still is what was checked and its app is still active. A row's incidents
 * are replaced in the same transaction as that conditional update.
 */

export type RefreshOptions = {
  fetchText?: FetchText;
  now?: Date;
  /** Check only these hosting row ids. */
  only?: string[];
  /** Stop asking the sources after this long; rows whose sources had not answered by then are left as they were. */
  budgetMs?: number;
};

export type RefreshSummary = {apps: number; hosting: number; failedSources: string[]};

const REASON_MAX_LENGTH = 80;

/** Checks one active app's hosting rows now (all of them, or only the ids given) and returns the app's rows as stored. */
export async function refreshHostingHealth(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  options: RefreshOptions = {},
): Promise<HostingView[]> {
  await assertActiveApp(db, workspaceId, appId);
  const filters = [eq(appHosting.workspaceId, workspaceId), eq(appHosting.appId, appId)];
  if (options.only) {
    filters.push(inArray(appHosting.id, options.only));
  }
  const rows = await loadHosting(db, and(...filters));
  await checkRows(db, workspaceId, rows, options);
  return listHosting(db, workspaceId, appId);
}

/**
 * The check that follows a write (add, edit). It gives up after
 * MONITORING_FOLLOW_UP_BUDGET_MS so the response is not held up; a row not
 * checked by then stays unchecked until the next refresh.
 */
export function checkHostingAfterWrite(db: AppDatabase, workspaceId: string, appId: string, only: string[]): Promise<HostingView[]> {
  return refreshHostingHealth(db, workspaceId, appId, {only, budgetMs: MONITORING_FOLLOW_UP_BUDGET_MS});
}

/**
 * Checks every hosting row of every active app in the workspace (the daily job).
 * An app archived while it runs is skipped: nothing is stored on its rows and it is not counted.
 */
export async function refreshWorkspaceHostingHealth(
  db: AppDatabase,
  workspaceId: string,
  options: RefreshOptions = {},
): Promise<RefreshSummary> {
  const rows = await loadHosting(db, and(eq(appHosting.workspaceId, workspaceId), inArray(appHosting.appId, activeAppIds(db, workspaceId))));
  const {stored, failedSources} = await checkRows(db, workspaceId, rows, options);
  return {apps: new Set(stored.map((row) => row.appId)).size, hosting: stored.length, failedSources};
}

type Failure = {error: string};
type Answer = {body: string} | Failure;
type Result<T> = {value: T} | Failure;

const isFailure = (outcome: object): outcome is Failure => 'error' in outcome;
type Lookup = {product: string; version: string};

/** Checks the rows and stores what it finds. Returns the rows it stored an answer on, and the sources that failed, each named once. */
async function checkRows(
  db: AppDatabase,
  workspaceId: string,
  rows: HostingRecord[],
  options: RefreshOptions,
): Promise<{stored: HostingRecord[]; failedSources: string[]}> {
  const {fetchText = createFetchText(), now = new Date()} = options;
  const outOfTime = options.budgetMs === undefined ? undefined : AbortSignal.timeout(options.budgetMs);
  const feeds = uniqueByUrl(rows.flatMap(statusFeed));
  const answers = await fetchAll([...new Set(rows.flatMap(sourceUrls))], fetchText, outOfTime);
  // Each provider feed is parsed once per run, however many rows use it.
  const openByFeed = new Map(
    feeds.map((feed) => [feed.url, read(answers.get(feed.url), feed.name, (body) => parseStatusFeed(feed, body))]),
  );

  const stored: HostingRecord[] = [];
  const failed = new Set<string>();
  // Rows whose sources were all asked in time; the rest are left as they were.
  for (const row of rows.filter((row) => sourceUrls(row).every((url) => answers.has(url)))) {
    const errors: string[] = [];
    const found = {
      ...endOfSupport(row, answers, errors),
      incidents: incidents(row, openByFeed, errors),
      healthCheckedAt: now,
      healthError: errors.length > 0 ? cleanText(errors.join('; '), HOSTING_CHECK_ERROR_MAX_LENGTH) : null,
    };
    if (await store(db, workspaceId, row, found)) {
      stored.push(row);
      errors.forEach((error) => failed.add(error));
    }
  }
  return {stored, failedSources: [...failed]};
}

type Found = Pick<HostingRecord, 'endOfSupportOn' | 'endOfSupportSource' | 'healthCheckedAt' | 'healthError'> & {
  /** Null when the provider's feed could not be read: the incidents the row had are kept. */
  incidents: HostingIncident[] | null;
};

/**
 * Stores what a check found on one row, and its incidents with it, in one
 * transaction. Answers false, storing nothing, when the row is no longer what
 * was checked or its app is no longer active.
 */
function store(db: AppDatabase, workspaceId: string, row: HostingRecord, found: Found): Promise<boolean> {
  const {incidents: open, ...columns} = found;
  return db.transaction(async (tx) => {
    const written = await tx
      .update(appHosting)
      .set(columns)
      .where(and(eq(appHosting.id, row.id), ...stillAsChecked(row), inArray(appHosting.appId, activeAppIds(tx, workspaceId))))
      .returning({id: appHosting.id});
    if (written.length === 0) {
      return false;
    }
    if (open !== null) {
      await replaceIncidents(tx, row, open);
    }
    return true;
  });
}

/**
 * True only while the row still has what was checked. An edit made while the
 * sources were being asked wins: the answer was about another service, version,
 * region or (hand-set) date, so it is dropped.
 */
function stillAsChecked(row: HostingRecord): SQL[] {
  const same = (column: AnyPgColumn, value: string | null) => (value === null ? isNull(column) : eq(column, value));
  return [
    same(appHosting.provider, row.provider),
    same(appHosting.service, row.service),
    same(appHosting.region, row.region),
    same(appHosting.version, row.version),
    same(appHosting.runtime, row.runtime),
    same(appHosting.runtimeVersion, row.runtimeVersion),
    same(appHosting.endOfSupportOn, row.endOfSupportOn),
    same(appHosting.endOfSupportSource, row.endOfSupportSource),
  ];
}

/** The workspace's active apps, read again inside each write: an app archived mid-run gets nothing stored. */
function activeAppIds(db: AppDatabase, workspaceId: string) {
  return db.select({id: apps.id}).from(apps).where(activeAppsIn(workspaceId));
}

function uniqueByUrl(feeds: StatusFeed[]): StatusFeed[] {
  return [...new Map(feeds.map((feed) => [feed.url, feed])).values()];
}

/**
 * Fetches each URL once, a few at a time. A failure is an answer, not an
 * exception. A URL not answered before `outOfTime` aborts has no answer at all.
 */
async function fetchAll(urls: string[], fetchText: FetchText, outOfTime?: AbortSignal): Promise<Map<string, Answer>> {
  const answers = new Map<string, Answer>();
  await mapWithLimit(urls, async (url) => {
    if (outOfTime?.aborted) {
      return;
    }
    try {
      answers.set(url, {body: await fetchText(url, outOfTime)});
    } catch (error) {
      if (!outOfTime?.aborted) {
        answers.set(url, {error: `could not be reached (${reason(error)})`});
      }
    }
  });
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

function statusFeed(row: HostingRecord): StatusFeed[] {
  const feed = findProvider(row.provider)?.statusFeed;
  return feed ? [feed] : [];
}

/** Every URL the check reads for a row. Only catalog values go into them; nothing a person typed leaves the server. */
function sourceUrls(row: HostingRecord): string[] {
  return [...statusFeed(row).map((feed) => feed.url), ...endOfLifeLookups(row).map(({product}) => endOfLifeUrl(product))];
}

/** What to ask endoflife.date for a row: its service's version and its runtime's version, when the catalog knows them. */
function endOfLifeLookups(row: HostingRecord): Lookup[] {
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
  row: HostingRecord,
  answers: Map<string, Answer>,
  errors: string[],
): Pick<HostingRecord, 'endOfSupportOn' | 'endOfSupportSource'> {
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

/** The open incidents that reach this row; null (keep what it had) when its provider's feed could not be read. */
function incidents(
  row: HostingRecord,
  openByFeed: Map<string, Result<FeedIncident[]>>,
  errors: string[],
): HostingIncident[] | null {
  const [feed] = statusFeed(row);
  if (!feed) {
    return [];
  }
  const open = openByFeed.get(feed.url);
  if (!open || isFailure(open)) {
    errors.push(open?.error ?? `${feed.name} was not fetched`);
    return null;
  }
  const target = {components: findService(row.provider, row.service)?.statusComponents, region: row.region};
  const reaching = open.value.flatMap((incident) => {
    const scope = incidentScope(incident, target);
    return scope ? [{title: incident.title, impact: incident.impact, scope, url: incident.url, startedAt: incident.startedAt}] : [];
  });
  return normaliseIncidents(reaching, row.provider);
}
