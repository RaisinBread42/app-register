import {
  APP_KINDS,
  APP_LIST_SORT,
  CENTS_PER_UNIT,
  HOSTING_HEALTH_STATUS,
  type AppKind,
  type AppListSort,
} from "@/lib/constants";

/** User-facing labels for the values the API uses. */

export const KIND_LABEL: Record<AppKind, string> = {
  saas: "SaaS (bought)",
  in_house: "In-house",
  citizen_built: "Citizen-built",
  vendor_service: "Vendor service",
};

export const KIND_OPTIONS = APP_KINDS.map((kind) => ({
  value: kind,
  label: KIND_LABEL[kind],
}));

export const APP_LIST_SORT_LABEL: Record<AppListSort, string> = {
  [APP_LIST_SORT.health]: "Health (lowest)",
  [APP_LIST_SORT.name]: "Name (A–Z)",
  [APP_LIST_SORT.renewal]: "Renewal (soonest)",
};

/** For parts of the prototype that have no API yet. */
export const COMING_SOON = "Coming soon";
export const HEALTH_COMING_SOON = 'Health scoring is coming soon';
export const MONITORING_COMING_SOON = 'Source monitoring is coming soon';
export const LIVE_DATA_NOTE =
  "Health and status checks are coming soon; other data is live.";

export const NOT_SET = "—";

/** Shows an optional value, or a dash. */
export const orDash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === ""
    ? NOT_SET
    : String(value);

export function formatCost(
  costCents: number | null,
  billingCycle: string | null,
): string {
  if (costCents === null) {
    return NOT_SET;
  }
  const amount = (costCents / CENTS_PER_UNIT).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return billingCycle ? `${amount} · ${billingCycle}` : amount;
}

/** The prototype's check pills. `na` is drawn as a grey dash instead. */
export const STATUS_PILL = {
  [HOSTING_HEALTH_STATUS.ok]: { label: "✓ OK", variant: "green" },
  [HOSTING_HEALTH_STATUS.attention]: { label: "! Attention", variant: "yellow" },
  [HOSTING_HEALTH_STATUS.critical]: { label: "! Critical", variant: "red" },
} as const;
export const NOT_MONITORED = "Not monitored";
