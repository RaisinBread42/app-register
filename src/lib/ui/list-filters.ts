import {
  APP_HEALTH_FILTER,
  APP_KINDS,
  APP_LIST_SORT,
  APP_LIST_SORTS,
  APP_TAB,
  APP_TABS,
  FILTER_ALL,
  SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  UI_QUERY,
  type AppListSort,
  type AppTab,
  type SettingsSection,
} from "@/lib/constants";
import type { AppListView } from "./register-view";

/** A page's `searchParams`, as Next.js hands them over. */
export type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | undefined,
): T | undefined {
  return (allowed as readonly string[]).includes(value ?? "")
    ? (value as T)
    : undefined;
}

/** `/applications/:id?tab=` → the tab to open first; anything unknown opens the overview. */
export function appTab(value: string | string[] | undefined): AppTab {
  return oneOf(APP_TABS, first(value)) ?? APP_TAB.overview;
}

/** One text query parameter, or an empty string. */
export function textParam(params: SearchParams, name: string): string {
  return first(params[name]) ?? "";
}

/** `/settings?section=` → the section to open; anything unknown opens Monitoring sources. */
export function settingsSection(value: string | string[] | undefined): SettingsSection {
  return oneOf(SETTINGS_SECTIONS, first(value)) ?? SETTINGS_SECTION.sources;
}

const HEALTH_FILTERS = Object.values(APP_HEALTH_FILTER);

/** The applications list view a URL describes; unknown values fall back to the defaults. */
export function appListViewFrom(params: SearchParams): AppListView {
  return {
    query: textParam(params, UI_QUERY.search),
    kind: oneOf(APP_KINDS, first(params[UI_QUERY.kind])) ?? FILTER_ALL,
    health: oneOf(HEALTH_FILTERS, first(params[UI_QUERY.health])) ?? FILTER_ALL,
    sort: oneOf<AppListSort>(APP_LIST_SORTS, first(params[UI_QUERY.sort])) ?? APP_LIST_SORT.health,
  };
}

/** The query string for a list view, leaving out defaults so the plain list stays `/applications`. */
export function appListQuery(view: AppListView): string {
  const query = new URLSearchParams();
  if (view.query.trim()) query.set(UI_QUERY.search, view.query);
  if (view.kind !== FILTER_ALL) query.set(UI_QUERY.kind, view.kind);
  if (view.health !== FILTER_ALL) query.set(UI_QUERY.health, view.health);
  if (view.sort !== APP_LIST_SORT.health) query.set(UI_QUERY.sort, view.sort);
  const text = query.toString();
  return text ? `?${text}` : "";
}
