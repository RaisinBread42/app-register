import {
  API_QUERY,
  APP_KINDS,
  APP_SORTS,
  APP_TAB,
  APP_TABS,
  NOTICE_ALERT_STATUSES,
  type AppSort,
  type AppTab,
} from '@/lib/constants';
import type {AlertListFilter, AppListFilter} from './api-client';

/** A page's `searchParams`, as Next.js hands them over. */
export type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined): T | undefined {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : undefined;
}

/** `/apps?kind=&sort=&noticeDeadlineWithinDays=` → the API filter. Unknown values are dropped. */
export function appListFilter(params: SearchParams): AppListFilter {
  const days = first(params[API_QUERY.noticeDeadlineWithinDays]);
  const within = days && /^\d+$/.test(days) ? Number(days) : undefined;
  return {
    kind: oneOf(APP_KINDS, first(params[API_QUERY.kind])),
    sort: oneOf<AppSort>(APP_SORTS, first(params[API_QUERY.sort])),
    noticeDeadlineWithinDays: within,
  };
}

/** `/notices?status=` → the API filter. */
export function alertListFilter(params: SearchParams): AlertListFilter {
  return {status: oneOf(NOTICE_ALERT_STATUSES, first(params[API_QUERY.status]))};
}

/** `/apps/:id?tab=` → the tab to open first. */
export function appTab(value: string | string[] | undefined): AppTab {
  return oneOf(APP_TABS, first(value)) ?? APP_TAB.overview;
}
