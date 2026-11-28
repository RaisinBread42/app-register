import {
  APP_CRITICALITIES,
  APP_HEALTH_FILTERS,
  APP_KINDS,
  APP_LIST_SORTS,
  APP_TAB,
  APP_TABS,
  CRITICALITY_FILTER_NOT_SET,
  FILTER_ALL,
  SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  UI_QUERY,
  UI_QUERY_ON,
  type AppListSort,
  type AppTab,
  type SettingsSection,
} from "@/lib/constants";
import { DEFAULT_APP_LIST_VIEW, type AppListView } from "./catalog";

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

/** The applications list view a URL describes; unknown values fall back to the defaults. */
export function appListViewFrom(params: SearchParams): AppListView {
  return {
    query: textParam(params, UI_QUERY.search),
    kind: oneOf(APP_KINDS, first(params[UI_QUERY.kind])) ?? FILTER_ALL,
    criticality: oneOf([...APP_CRITICALITIES, CRITICALITY_FILTER_NOT_SET], first(params[UI_QUERY.criticality])) ?? FILTER_ALL,
    owner: textParam(params, UI_QUERY.owner) || FILTER_ALL,
    health: oneOf(APP_HEALTH_FILTERS, first(params[UI_QUERY.health])) ?? FILTER_ALL,
    openNotices: first(params[UI_QUERY.openNotices]) === UI_QUERY_ON,
    sort: oneOf<AppListSort>(APP_LIST_SORTS, first(params[UI_QUERY.sort])) ?? DEFAULT_APP_LIST_VIEW.sort,
  };
}

/** The query string for a list view, leaving out defaults so the plain list stays `/applications`. */
export function appListQuery(view: AppListView): string {
  const query = new URLSearchParams();
  if (view.query.trim()) query.set(UI_QUERY.search, view.query);
  if (view.kind !== FILTER_ALL) query.set(UI_QUERY.kind, view.kind);
  if (view.criticality !== FILTER_ALL) query.set(UI_QUERY.criticality, view.criticality);
  if (view.owner !== FILTER_ALL) query.set(UI_QUERY.owner, view.owner);
  if (view.health !== FILTER_ALL) query.set(UI_QUERY.health, view.health);
  if (view.openNotices) query.set(UI_QUERY.openNotices, UI_QUERY_ON);
  if (view.sort !== DEFAULT_APP_LIST_VIEW.sort) query.set(UI_QUERY.sort, view.sort);
  const text = query.toString();
  return text ? `?${text}` : "";
}
