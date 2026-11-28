import {and, asc, desc, eq, inArray, isNull, notInArray, sql} from 'drizzle-orm';
import {
  END_OF_SUPPORT_SOURCE,
  END_OF_SUPPORT_SOON_DAYS,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  MATCH_CONFIDENCE,
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY,
  NOTICE_ORIGIN,
  NOTICE_SEVERITIES,
  NOTICE_SEVERITY,
  NOTICE_SOURCE,
  NOTICE_STATE,
  NOTICE_STATES,
  NOTICE_SUMMARY_MAX_LENGTH,
  NOTICE_TITLE_MAX_LENGTH,
  type IncidentImpact,
  type MatchConfidence,
  type NoticeCategory,
  type NoticeOrigin,
  type NoticeSeverity,
  type NoticeSource,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {appDependencies, appHosting, appNoticeMatches, apps, notices} from '@/lib/db/schema';
import {findRuntime, findService} from '@/lib/hosting-catalog';
import {addDaysIso, todayIso} from '@/lib/notice-alerts';
import {advisoryUrl} from './advisories';
import {activeAppsIn} from './app-scope';
import {loadDependencies, type DependencyRecord} from './dependency-advisories';
import {NotFoundError, ValidationError} from './errors';
import {loadHosting, type HostingRecord} from './hosting-incidents';

/**
 * Notices (spec §3 P0): durable, explainable records of what changed or is due,
 * derived from what the dependency and hosting checks stored. A notice exists once
 * per thing (dedupe key) and is matched to each app that has the affected component,
 * service or version, with the reason and how sure the match is. A check never
 * deletes a notice or a match: when the source stops reporting it, or the app no
 * longer has what matched, it is marked resolved and the history stays.
 */

/** What a notice says, before it is stored. */
export type NoticeFacts = {
  dedupeKey: string;
  category: NoticeCategory;
  severity: NoticeSeverity;
  title: string;
  summary: string;
  source: NoticeSource;
  sourceName: string;
  sourceUrl: string | null;
  externalId: string | null;
  origin: NoticeOrigin;
  publishedAt: Date | null;
  dueOn: string | null;
};

/** Why it concerns one app. */
export type MatchFacts = {
  component: string;
  version: string | null;
  region: string | null;
  matchReason: string;
  confidence: MatchConfidence;
};

export type DerivedNotice = NoticeFacts & {match: MatchFacts};

const SOURCE_NAME = {
  osv: 'OSV',
  endOfLifeDate: 'endoflife.date',
  manual: 'Entered by a person',
} as const;

const END_OF_LIFE_PAGE = 'https://endoflife.date';

const INCIDENT_SEVERITY: Record<IncidentImpact, NoticeSeverity> = {
  [INCIDENT_IMPACT.major]: NOTICE_SEVERITY.high,
  [INCIDENT_IMPACT.minor]: NOTICE_SEVERITY.medium,
  [INCIDENT_IMPACT.maintenance]: NOTICE_SEVERITY.low,
};

/** Most severe first; used to order notices. */
const SEVERITY_RANK: Record<NoticeSeverity, number> = {
  [NOTICE_SEVERITY.critical]: 0,
  [NOTICE_SEVERITY.high]: 1,
  [NOTICE_SEVERITY.medium]: 2,
  [NOTICE_SEVERITY.unknown]: 3,
  [NOTICE_SEVERITY.low]: 4,
};

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const key = (...parts: (string | null | undefined)[]) => parts.map((part) => (part ?? '').trim().toLowerCase()).join(':');

/**
 * Every notice that concerns one app, from what is stored about it. Only what the app
 * has can produce a notice (spec §8 check 21); a provider-wide incident that does not
 * name the app's service or region is a low-confidence match (check 22).
 */
export function noticesForApp(
  app: {name: string},
  dependencies: DependencyRecord[],
  hosting: HostingRecord[],
  today: string,
): DerivedNotice[] {
  return [
    ...dependencies.flatMap((dependency) => dependencyNotices(app, dependency)),
    ...hosting.flatMap((row) => [...endOfSupportNotices(app, row, today), ...incidentNotices(app, row)]),
  ];
}

function dependencyNotices(app: {name: string}, dependency: DependencyRecord): DerivedNotice[] {
  const component = dependency.name;
  const version = dependency.currentVersion;
  const found = dependency.advisories.map((advisory) => ({
    dedupeKey: key(NOTICE_SOURCE.osv, advisory.id),
    category: NOTICE_CATEGORY.security,
    severity: advisory.severity,
    title: cut(advisory.summary || advisory.id, NOTICE_TITLE_MAX_LENGTH),
    summary: cut(`${advisory.id}${advisory.aliases.length ? ` (also ${advisory.aliases.join(', ')})` : ''}: ${advisory.summary}`, NOTICE_SUMMARY_MAX_LENGTH),
    source: NOTICE_SOURCE.osv,
    sourceName: SOURCE_NAME.osv,
    sourceUrl: advisoryUrl(advisory.id),
    externalId: advisory.id,
    origin: NOTICE_ORIGIN.external,
    publishedAt: null,
    dueOn: null,
    match: {
      component,
      version,
      region: null,
      matchReason: `${app.name} uses ${component} ${version}, which OSV lists as affected by ${advisory.id}.`,
      confidence: MATCH_CONFIDENCE.high,
    },
  }));
  const foundIds = new Set(dependency.advisories.flatMap((advisory) => [advisory.id, ...advisory.aliases]).map((id) => id.toUpperCase()));
  const byHand = dependency.vulnerabilities
    .filter((id) => !foundIds.has(id.toUpperCase()))
    .map((id) => ({
      dedupeKey: key(NOTICE_SOURCE.manual, id),
      category: NOTICE_CATEGORY.security,
      severity: NOTICE_SEVERITY.unknown,
      title: cut(`${id} recorded on ${component}`, NOTICE_TITLE_MAX_LENGTH),
      summary: `A person recorded advisory ${id} against ${component} ${version}. No source has rated it.`,
      source: NOTICE_SOURCE.manual,
      sourceName: SOURCE_NAME.manual,
      sourceUrl: null,
      externalId: id,
      origin: NOTICE_ORIGIN.person,
      publishedAt: null,
      dueOn: null,
      match: {
        component,
        version,
        region: null,
        matchReason: `A person recorded ${id} against ${component} ${version} on ${app.name}.`,
        confidence: MATCH_CONFIDENCE.high,
      },
    }));
  return [...found, ...byHand];
}

/** What a hosting row runs, in words: its runtime and version, or the service and version. */
function hostingSubject(row: HostingRecord): {subject: string; version: string | null} {
  if (row.runtime) {
    return {subject: [row.runtime, row.runtimeVersion].filter(Boolean).join(' '), version: row.runtimeVersion};
  }
  return {subject: [row.provider, row.service, row.version].filter(Boolean).join(' '), version: row.version};
}

function endOfLifePage(row: HostingRecord): string | null {
  const product = (row.runtime ? findRuntime(row.runtime)?.eolProduct : undefined) ?? findService(row.provider, row.service)?.eolProduct;
  return product ? `${END_OF_LIFE_PAGE}/${encodeURIComponent(product)}` : null;
}

function endOfSupportNotices(app: {name: string}, row: HostingRecord, today: string): DerivedNotice[] {
  const date = row.endOfSupportOn;
  if (!date || date > addDaysIso(today, END_OF_SUPPORT_SOON_DAYS)) {
    return [];
  }
  const isPast = date < today;
  const byPerson = row.endOfSupportSource === END_OF_SUPPORT_SOURCE.manual;
  const {subject, version} = hostingSubject(row);
  const where = `${row.provider} ${row.service}`;
  return [
    {
      dedupeKey: key('eos', row.provider, row.service, row.runtime, version, date),
      category: NOTICE_CATEGORY.lifecycle,
      severity: isPast ? NOTICE_SEVERITY.high : NOTICE_SEVERITY.medium,
      title: cut(isPast ? `${subject} is past end of support (${date})` : `${subject} reaches end of support on ${date}`, NOTICE_TITLE_MAX_LENGTH),
      summary: isPast
        ? `${subject} stopped getting security fixes on ${date}. Move to a supported version.`
        : `${subject} stops getting security fixes on ${date}. Plan the upgrade before then.`,
      source: byPerson ? NOTICE_SOURCE.manual : NOTICE_SOURCE.endOfLifeDate,
      sourceName: byPerson ? SOURCE_NAME.manual : SOURCE_NAME.endOfLifeDate,
      sourceUrl: byPerson ? null : endOfLifePage(row),
      externalId: null,
      origin: byPerson ? NOTICE_ORIGIN.person : NOTICE_ORIGIN.external,
      publishedAt: null,
      dueOn: date,
      match: {
        component: where,
        version,
        region: row.region,
        matchReason: byPerson
          ? `A person set the end-of-support date of ${subject} on ${app.name}'s ${where} to ${date}.`
          : `${app.name} runs ${subject} on ${where}; endoflife.date gives ${date} as its end of support${row.isVersionInexact ? ' (the version matched several releases, so this is the earliest date)' : ''}.`,
        confidence: row.isVersionInexact ? MATCH_CONFIDENCE.medium : MATCH_CONFIDENCE.high,
      },
    },
  ];
}

function incidentNotices(app: {name: string}, row: HostingRecord): DerivedNotice[] {
  const where = `${row.provider} ${row.service}`;
  return row.incidents.map((incident) => {
    const namesService = incident.scope === INCIDENT_SCOPE.service;
    return {
      dedupeKey: key('status', row.provider, incident.url ?? incident.title, incident.startedAt),
      category: NOTICE_CATEGORY.outage,
      severity: INCIDENT_SEVERITY[incident.impact],
      title: cut(incident.title, NOTICE_TITLE_MAX_LENGTH),
      summary: `${row.provider} reports: ${incident.title}`,
      source: NOTICE_SOURCE.statusFeed,
      sourceName: `${row.provider} status`,
      sourceUrl: incident.url,
      externalId: null,
      origin: NOTICE_ORIGIN.external,
      publishedAt: incident.startedAt ? new Date(incident.startedAt) : null,
      dueOn: null,
      match: {
        component: where,
        version: null,
        region: row.region,
        matchReason: namesService
          ? `${row.provider}'s status page names ${app.name}'s service or region (${[row.service, row.region].filter(Boolean).join(', ')}).`
          : `${row.provider}'s status page reports this without naming ${app.name}'s service or region, so it may not affect it.`,
        confidence: namesService ? MATCH_CONFIDENCE.high : MATCH_CONFIDENCE.low,
      },
    };
  });
}

/**
 * Brings one app's notices in line with what is stored about it: new notices and
 * matches are added, existing ones updated (last seen, severity, wording), and matches
 * the app no longer has are marked resolved. A notice with no open match left is
 * marked resolved upstream. Nothing is deleted.
 */
export async function syncAppNotices(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  now = new Date(),
  today = todayIso(),
): Promise<void> {
  const [app] = await db.select({name: apps.name}).from(apps).where(and(activeAppsIn(workspaceId), eq(apps.id, appId)));
  if (!app) {
    return;
  }
  const dependencies = await loadDependencies(db, and(eq(appDependencies.workspaceId, workspaceId), eq(appDependencies.appId, appId)));
  const hosting = await loadHosting(db, and(eq(appHosting.workspaceId, workspaceId), eq(appHosting.appId, appId)));
  const derived = noticesForApp(app, dependencies, hosting, today);

  await db.transaction(async (tx) => {
    const seenMatchIds: string[] = [];
    for (const {match, ...facts} of derived) {
      const noticeId = await upsertNotice(tx, workspaceId, facts, now);
      seenMatchIds.push(await upsertMatch(tx, workspaceId, noticeId, appId, match, now));
    }
    const resolved = await tx
      .update(appNoticeMatches)
      .set({resolvedAt: now})
      .where(
        and(
          eq(appNoticeMatches.workspaceId, workspaceId),
          eq(appNoticeMatches.appId, appId),
          isNull(appNoticeMatches.resolvedAt),
          seenMatchIds.length ? notInArray(appNoticeMatches.id, seenMatchIds) : undefined,
        ),
      )
      .returning({noticeId: appNoticeMatches.noticeId});
    await markResolvedUpstream(tx, workspaceId, [...new Set(resolved.map((row) => row.noticeId))], now);
  });
}

/** Syncs every active app in the workspace (the daily job and start-up backfill). */
export async function syncWorkspaceNotices(db: AppDatabase, workspaceId: string, now = new Date(), today = todayIso()): Promise<number> {
  const rows = await db.select({id: apps.id}).from(apps).where(activeAppsIn(workspaceId));
  for (const row of rows) {
    await syncAppNotices(db, workspaceId, row.id, now, today);
  }
  return rows.length;
}

async function upsertNotice(tx: AppDatabase, workspaceId: string, facts: NoticeFacts, now: Date): Promise<string> {
  const [row] = await tx
    .insert(notices)
    .values({id: newId(), workspaceId, ...facts, firstSeenAt: now, lastSeenAt: now})
    .onConflictDoUpdate({
      target: [notices.workspaceId, notices.dedupeKey],
      set: {
        severity: facts.severity,
        title: facts.title,
        summary: facts.summary,
        sourceUrl: facts.sourceUrl,
        publishedAt: facts.publishedAt,
        dueOn: facts.dueOn,
        lastSeenAt: now,
        resolvedUpstreamAt: null,
      },
    })
    .returning({id: notices.id});
  return row.id;
}

async function upsertMatch(
  tx: AppDatabase,
  workspaceId: string,
  noticeId: string,
  appId: string,
  match: MatchFacts,
  now: Date,
): Promise<string> {
  const [row] = await tx
    .insert(appNoticeMatches)
    .values({id: newId(), workspaceId, noticeId, appId, ...match, firstSeenAt: now, lastSeenAt: now})
    .onConflictDoUpdate({
      target: [appNoticeMatches.noticeId, appNoticeMatches.appId, appNoticeMatches.component],
      set: {
        version: match.version,
        region: match.region,
        matchReason: match.matchReason,
        confidence: match.confidence,
        lastSeenAt: now,
        resolvedAt: null,
      },
    })
    .returning({id: appNoticeMatches.id});
  return row.id;
}

/** Notices among `noticeIds` with no open match left are resolved upstream. */
async function markResolvedUpstream(tx: AppDatabase, workspaceId: string, noticeIds: string[], now: Date): Promise<void> {
  if (noticeIds.length === 0) {
    return;
  }
  await tx
    .update(notices)
    .set({resolvedUpstreamAt: now})
    .where(
      and(
        eq(notices.workspaceId, workspaceId),
        inArray(notices.id, noticeIds),
        isNull(notices.resolvedUpstreamAt),
        sql`not exists (select 1 from ${appNoticeMatches} m where m.notice_id = ${notices.id} and m.resolved_at is null)`,
      ),
    );
}

// --- Reading -----------------------------------------------------------------

export type NoticeMatchView = {
  id: string;
  app: {id: string; name: string};
  component: string;
  version: string | null;
  region: string | null;
  matchReason: string;
  confidence: MatchConfidence;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
};

/** JSON shape of a notice in the API: the notice, its source, and the active apps it matches. */
export type NoticeView = NoticeFacts & {
  id: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedUpstreamAt: Date | null;
  matches: NoticeMatchView[];
};

export type NoticeListQuery = {appId?: string | null; severity?: string | null; category?: string | null; state?: string | null};

/**
 * Notices that concern active apps, most severe first, then the soonest date.
 * `open` (the default): not resolved upstream and still matching an app; `resolved`: the rest.
 */
export async function listNotices(db: AppDatabase, workspaceId: string, query: NoticeListQuery = {}): Promise<NoticeView[]> {
  const state = oneOf(NOTICE_STATES, query.state, 'state') ?? NOTICE_STATE.open;
  const severity = oneOf(NOTICE_SEVERITIES, query.severity, 'severity');
  const category = oneOf(NOTICE_CATEGORIES, query.category, 'category');
  if (query.appId && !isUuid(query.appId)) {
    return [];
  }
  const views = await loadNoticeViews(db, workspaceId, {
    severity,
    category,
    appId: query.appId ?? undefined,
  });
  return views.filter((view) => {
    const isOpen = view.resolvedUpstreamAt === null && view.matches.some((match) => match.resolvedAt === null);
    return state === NOTICE_STATE.all || (state === NOTICE_STATE.open) === isOpen;
  });
}

/** One notice with its matches on active apps. 404 outside the workspace. */
export async function getNotice(db: AppDatabase, workspaceId: string, id: string): Promise<NoticeView> {
  const [view] = isUuid(id) ? await loadNoticeViews(db, workspaceId, {id}) : [];
  if (!view) {
    throw new NotFoundError('Notice not found');
  }
  return view;
}

async function loadNoticeViews(
  db: AppDatabase,
  workspaceId: string,
  filter: {id?: string; severity?: NoticeSeverity; category?: NoticeCategory; appId?: string},
): Promise<NoticeView[]> {
  const rows = await db
    .select({notice: notices, match: appNoticeMatches, app: {id: apps.id, name: apps.name}})
    .from(notices)
    .innerJoin(appNoticeMatches, and(eq(appNoticeMatches.noticeId, notices.id), eq(appNoticeMatches.workspaceId, workspaceId)))
    .innerJoin(apps, and(eq(apps.id, appNoticeMatches.appId), activeAppsIn(workspaceId)))
    .where(
      and(
        eq(notices.workspaceId, workspaceId),
        filter.id ? eq(notices.id, filter.id) : undefined,
        filter.severity ? eq(notices.severity, filter.severity) : undefined,
        filter.category ? eq(notices.category, filter.category) : undefined,
        filter.appId
          ? sql`exists (select 1 from ${appNoticeMatches} f where f.notice_id = ${notices.id} and f.app_id = ${filter.appId})`
          : undefined,
      ),
    )
    .orderBy(asc(notices.dueOn), desc(notices.lastSeenAt), asc(apps.name));
  const byId = new Map<string, NoticeView>();
  for (const {notice, match, app} of rows) {
    const view = byId.get(notice.id) ?? toNoticeView(notice);
    view.matches.push({
      id: match.id,
      app,
      component: match.component,
      version: match.version,
      region: match.region,
      matchReason: match.matchReason,
      confidence: match.confidence as MatchConfidence,
      firstSeenAt: match.firstSeenAt,
      lastSeenAt: match.lastSeenAt,
      resolvedAt: match.resolvedAt,
    });
    byId.set(notice.id, view);
  }
  return [...byId.values()].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

function toNoticeView(notice: typeof notices.$inferSelect): NoticeView {
  return {
    id: notice.id,
    dedupeKey: notice.dedupeKey,
    category: notice.category as NoticeCategory,
    severity: notice.severity as NoticeSeverity,
    title: notice.title,
    summary: notice.summary,
    source: notice.source as NoticeSource,
    sourceName: notice.sourceName,
    sourceUrl: notice.sourceUrl,
    externalId: notice.externalId,
    origin: notice.origin as NoticeOrigin,
    publishedAt: notice.publishedAt,
    dueOn: notice.dueOn,
    firstSeenAt: notice.firstSeenAt,
    lastSeenAt: notice.lastSeenAt,
    resolvedUpstreamAt: notice.resolvedUpstreamAt,
    matches: [],
  };
}

function oneOf<T extends string>(allowed: readonly T[], value: string | null | undefined, name: string): T | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}
