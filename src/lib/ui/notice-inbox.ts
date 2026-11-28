import {
  FILTER_ALL,
  MATCH_STATUS,
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY,
  NOTICE_SEVERITIES,
  NOTICE_SEVERITY,
  OPEN_MATCH_STATUSES,
  UI_QUERY,
  type NoticeCategory,
  type NoticeSeverity,
} from '@/lib/constants';
import type {Notice, NoticeMatch} from './api-client';
import type {SearchParams} from './list-filters';

/**
 * The notice inbox's rules, kept out of components so they can be tested: one row
 * per notice on one app (status belongs to the app), filtered and ordered as the
 * URL says, and the plain-words next step for each kind of notice.
 */

export type InboxRow = {notice: Notice; match: NoticeMatch};

/** Status groups the inbox filters on: open needs attention (new or reviewing). */
export const INBOX_STATUS = {open: 'open', snoozed: 'snoozed', handled: 'handled', all: FILTER_ALL} as const;
export const INBOX_STATUSES = Object.values(INBOX_STATUS);
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const INBOX_GROUP = {severity: 'severity', app: 'app'} as const;
export const INBOX_GROUPS = Object.values(INBOX_GROUP);
export type InboxGroup = (typeof INBOX_GROUPS)[number];

export type InboxView = {
  status: InboxStatus;
  severity: NoticeSeverity | typeof FILTER_ALL;
  category: NoticeCategory | typeof FILTER_ALL;
  app: string;
  group: InboxGroup;
  /** The open drawer's match id, or empty. */
  notice: string;
};

export const DEFAULT_INBOX_VIEW: InboxView = {
  status: INBOX_STATUS.open,
  severity: FILTER_ALL,
  category: FILTER_ALL,
  app: FILTER_ALL,
  group: INBOX_GROUP.severity,
  notice: '',
};

const SEVERITY_RANK: Record<NoticeSeverity, number> = {
  [NOTICE_SEVERITY.critical]: 0,
  [NOTICE_SEVERITY.high]: 1,
  [NOTICE_SEVERITY.medium]: 2,
  [NOTICE_SEVERITY.unknown]: 3,
  [NOTICE_SEVERITY.low]: 4,
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
const pick = <T extends string>(allowed: readonly T[], value: string, fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export function inboxViewFrom(params: SearchParams): InboxView {
  return {
    status: pick(INBOX_STATUSES, first(params[UI_QUERY.status]), DEFAULT_INBOX_VIEW.status),
    severity: pick<NoticeSeverity | typeof FILTER_ALL>([...NOTICE_SEVERITIES, FILTER_ALL], first(params[UI_QUERY.severity]), FILTER_ALL),
    category: pick<NoticeCategory | typeof FILTER_ALL>([...NOTICE_CATEGORIES, FILTER_ALL], first(params[UI_QUERY.category]), FILTER_ALL),
    app: first(params[UI_QUERY.app]) || FILTER_ALL,
    group: pick(INBOX_GROUPS, first(params[UI_QUERY.group]), DEFAULT_INBOX_VIEW.group),
    notice: first(params[UI_QUERY.notice]),
  };
}

/** The query string for a view, leaving out defaults so the plain inbox stays `/notices`. */
export function inboxQuery(view: InboxView): string {
  const query = new URLSearchParams();
  const entries: [string, string, string][] = [
    [UI_QUERY.status, view.status, DEFAULT_INBOX_VIEW.status],
    [UI_QUERY.severity, view.severity, FILTER_ALL],
    [UI_QUERY.category, view.category, FILTER_ALL],
    [UI_QUERY.app, view.app, FILTER_ALL],
    [UI_QUERY.group, view.group, DEFAULT_INBOX_VIEW.group],
    [UI_QUERY.notice, view.notice, ''],
  ];
  for (const [name, value, fallback] of entries) {
    if (value !== fallback) {
      query.set(name, value);
    }
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

function matchesStatus(match: NoticeMatch, status: InboxStatus): boolean {
  if (status === INBOX_STATUS.all) {
    return true;
  }
  if (status === INBOX_STATUS.open) {
    return OPEN_MATCH_STATUSES.includes(match.status);
  }
  return match.status === status;
}

/** The rows a view shows, most severe first (or by application), then the soonest date. */
export function inboxRows(notices: Notice[], view: InboxView): InboxRow[] {
  const rows = notices.flatMap((notice) =>
    notice.matches.filter((match) => match.resolvedAt === null).map((match) => ({notice, match})),
  );
  const shown = rows.filter(
    ({notice, match}) =>
      matchesStatus(match, view.status) &&
      (view.severity === FILTER_ALL || notice.severity === view.severity) &&
      (view.category === FILTER_ALL || notice.category === view.category) &&
      (view.app === FILTER_ALL || match.app.id === view.app),
  );
  return shown.sort((a, b) => {
    const byApp = view.group === INBOX_GROUP.app ? a.match.app.name.localeCompare(b.match.app.name) : 0;
    return (
      byApp ||
      SEVERITY_RANK[a.notice.severity] - SEVERITY_RANK[b.notice.severity] ||
      (a.notice.dueOn ?? '9999').localeCompare(b.notice.dueOn ?? '9999') ||
      b.notice.lastSeenAt.localeCompare(a.notice.lastSeenAt)
    );
  });
}

/** Rows that still need someone: open status on an open notice. Used for the nav count. */
export function openCount(notices: Notice[]): number {
  return inboxRows(notices, DEFAULT_INBOX_VIEW).length;
}

/** What to do, in plain words, for one notice on one app (spec §6: what to do comes before the source). */
export function nextStep(notice: Notice, match: NoticeMatch): string {
  switch (notice.category) {
    case NOTICE_CATEGORY.security:
      return `Upgrade ${match.component} on ${match.app.name} to a version without ${notice.externalId ?? 'this advisory'}, or record why the risk is accepted.`;
    case NOTICE_CATEGORY.lifecycle:
      return `Plan the move of ${match.app.name} to a supported version${notice.dueOn ? ` before ${notice.dueOn}` : ''}, and assign someone to own it.`;
    case NOTICE_CATEGORY.outage:
      return `Check the provider's status page; if ${match.app.name} is affected, tell its users and follow the provider's updates.`;
    case NOTICE_CATEGORY.deadline:
      return `Decide whether to renew, cancel or renegotiate before the deadline, and record the decision.`;
    default:
      return `Review what changed and record what you decide for ${match.app.name}.`;
  }
}

/** Snoozes can only be set for a later day; the date input's minimum. */
export function tomorrow(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export {MATCH_STATUS};
