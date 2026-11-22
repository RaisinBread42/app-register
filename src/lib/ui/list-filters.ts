import { APP_TAB, APP_TABS, type AppTab } from "@/lib/constants";

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
