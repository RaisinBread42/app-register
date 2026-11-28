import {useSyncExternalStore} from 'react';
import {ROUTES} from '@/lib/constants';

/**
 * The applications list's last query string, kept per browser tab so the
 * "All applications" link on a detail page returns to the same filtered list.
 * Storage can be blocked (private windows), so every access is guarded and the
 * plain list is the fallback.
 */
const KEY = 'app-register:applications-list-query';

export function rememberListQuery(query: string): void {
  try {
    window.sessionStorage.setItem(KEY, query);
  } catch {
    // Storage blocked: the link falls back to the plain list.
  }
}

/** `/applications` plus the last remembered query, or the plain list. */
export function rememberedListHref(): string {
  try {
    const query = window.sessionStorage.getItem(KEY) ?? '';
    return query.startsWith('?') ? `${ROUTES.applications}${query}` : ROUTES.applications;
  } catch {
    return ROUTES.applications;
  }
}

const noSubscription = () => () => {};

/** The remembered list link for a client component; the server and first paint use the plain list. */
export function useRememberedListHref(): string {
  return useSyncExternalStore(noSubscription, rememberedListHref, () => ROUTES.applications);
}
