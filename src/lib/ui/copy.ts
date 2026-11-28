import {
  APP_CRITICALITIES,
  APP_CRITICALITY,
  APP_ENVIRONMENT,
  APP_ENVIRONMENTS,
  APP_HEALTH_FILTER,
  APP_KINDS,
  APP_LIST_SORT,
  MATCH_CONFIDENCE,
  MATCH_STATUS,
  NOTICE_CATEGORY,
  NOTICE_SEVERITY,
  CENTS_PER_UNIT,
  DEPENDENCY_CHECK_ERROR,
  FILTER_ALL,
  HEALTH_ATTENTION_BELOW,
  HEALTH_STATUS,
  type AdvisorySeverity,
  type AppCriticality,
  type AppEnvironment,
  type AppKind,
  type AppListSort,
  type MatchConfidence,
  type MatchStatus,
  type NoticeCategory,
  type NoticeSeverity,
  type DependencyCheckError,
  type HealthDimension,
  type HealthStatus,
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

export const CRITICALITY_LABEL: Record<AppCriticality, string> = {
  [APP_CRITICALITY.low]: "Low",
  [APP_CRITICALITY.medium]: "Medium",
  [APP_CRITICALITY.high]: "High",
  [APP_CRITICALITY.critical]: "Critical",
};

export const CRITICALITY_OPTIONS = APP_CRITICALITIES.map((criticality) => ({
  value: criticality,
  label: CRITICALITY_LABEL[criticality],
}));

export const ENVIRONMENT_LABEL: Record<AppEnvironment, string> = {
  [APP_ENVIRONMENT.production]: "Production",
  [APP_ENVIRONMENT.staging]: "Staging",
  [APP_ENVIRONMENT.development]: "Development",
  [APP_ENVIRONMENT.other]: "Other",
};

export const ENVIRONMENT_OPTIONS = APP_ENVIRONMENTS.map((environment) => ({
  value: environment,
  label: ENVIRONMENT_LABEL[environment],
}));

export const NOTICE_SEVERITY_LABEL: Record<NoticeSeverity, string> = {
  [NOTICE_SEVERITY.critical]: "Critical",
  [NOTICE_SEVERITY.high]: "High",
  [NOTICE_SEVERITY.medium]: "Medium",
  [NOTICE_SEVERITY.low]: "Low",
  [NOTICE_SEVERITY.unknown]: "Unrated",
};

/** Badge colour per severity; the label always carries the meaning too (spec §6). */
export const NOTICE_SEVERITY_VARIANT: Record<NoticeSeverity, "red" | "orange" | "yellow" | "gray" | "blue"> = {
  [NOTICE_SEVERITY.critical]: "red",
  [NOTICE_SEVERITY.high]: "orange",
  [NOTICE_SEVERITY.medium]: "yellow",
  [NOTICE_SEVERITY.low]: "blue",
  [NOTICE_SEVERITY.unknown]: "gray",
};

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  [MATCH_STATUS.new]: "New",
  [MATCH_STATUS.reviewing]: "Reviewing",
  [MATCH_STATUS.snoozed]: "Snoozed",
  [MATCH_STATUS.handled]: "Handled",
};

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  [NOTICE_CATEGORY.security]: "Security advisory",
  [NOTICE_CATEGORY.lifecycle]: "End of support",
  [NOTICE_CATEGORY.outage]: "Provider incident",
  [NOTICE_CATEGORY.licensing]: "Licensing",
  [NOTICE_CATEGORY.pricing]: "Pricing",
  [NOTICE_CATEGORY.deadline]: "Deadline",
};

export const MATCH_CONFIDENCE_LABEL: Record<MatchConfidence, string> = {
  [MATCH_CONFIDENCE.high]: "High confidence",
  [MATCH_CONFIDENCE.medium]: "Medium confidence",
  [MATCH_CONFIDENCE.low]: "Low confidence: may not affect this app",
};

export const NO_BACKUP_OWNER = "No backup owner";
export const CRITICALITY_NOT_SET = "Not set";

export const APP_LIST_SORT_LABEL: Record<AppListSort, string> = {
  [APP_LIST_SORT.health]: "Health (lowest)",
  [APP_LIST_SORT.name]: "Name (A–Z)",
  [APP_LIST_SORT.renewal]: "Renewal (soonest)",
};

const HEALTHY = "Healthy";
const NEEDS_ATTENTION = "Needs attention";

export const HEALTH_FILTER_OPTIONS = [
  { value: FILTER_ALL, label: "All health" },
  { value: APP_HEALTH_FILTER.attention, label: NEEDS_ATTENTION },
  { value: APP_HEALTH_FILTER.healthy, label: HEALTHY },
];

/** For parts of the prototype that have no API yet. */
export const COMING_SOON = "Coming soon";
export const MONITORING_COMING_SOON = 'Source monitoring is coming soon';
export const LIVE_DATA_NOTE =
  "Health scores come from dependency and hosting checks; licence and pricing checks are coming soon.";

/** Shown wherever a score is, while dependencies and hosting are the monitored dimensions. */
export const HEALTH_BASIS_NOTE = "Based on dependencies and hosting; licence and pricing checks coming soon.";
export const NO_SCORE_TITLE = "No health score yet";
export const NO_SCORE_HINT =
  "Import a package.json or package-lock.json on an application's Dependencies tab, or add where it runs on its Hosting tab, to score it. A score appears once they have been checked.";
export const NOTHING_TO_CHECK = "Nothing recorded or checked yet";

/** Badge colours of the prototype's score and check pills. */
export type StatusVariant = "green" | "yellow" | "red" | "neutral";
export const HEALTH_STATUS_VARIANT: Record<HealthStatus, StatusVariant> = {
  [HEALTH_STATUS.ok]: "green",
  [HEALTH_STATUS.attention]: "yellow",
  [HEALTH_STATUS.critical]: "red",
  [HEALTH_STATUS.na]: "neutral",
};

/** The prototype's check pills: "✓ OK", "! Attention", "! Critical". */
export const HEALTH_STATUS_LABEL: Record<HealthStatus, string> = {
  [HEALTH_STATUS.ok]: "✓ OK",
  [HEALTH_STATUS.attention]: "! Attention",
  [HEALTH_STATUS.critical]: "! Critical",
  [HEALTH_STATUS.na]: "—",
};

/** The badge under the big score on an application's page. */
export const healthVerdict = (score: number) =>
  score >= HEALTH_ATTENTION_BELOW ? HEALTHY : NEEDS_ATTENTION;

export const DIMENSION_LABEL: Record<HealthDimension, string> = {
  dependencies: "Dependencies",
  hosting: "Hosting & infrastructure",
  licence: "Licence",
  pricing: "Pricing",
};

export const SEVERITY_VARIANT: Record<AdvisorySeverity, StatusVariant> = {
  critical: "red",
  high: "red",
  medium: "yellow",
  low: "neutral",
  unknown: "yellow",
};

export const CHECK_ERROR_LABEL: Record<DependencyCheckError, string> = {
  [DEPENDENCY_CHECK_ERROR.notFound]: "Not found in registry",
  [DEPENDENCY_CHECK_ERROR.unavailable]: "Check failed; will retry",
  [DEPENDENCY_CHECK_ERROR.invalidVersion]:
    "Version is a range; import package-lock.json for exact versions",
};
/** Why a dependency has no status when no check has failed: none has finished yet. */
/** Beside a looked-up end-of-support date whose version matched several releases. */
export const VERSION_NOT_EXACT = 'Version is not exact; using the earliest matching release';
export const NOT_CHECKED_YET = "Not checked yet";

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

/** Why a hosting row has no status when no check has failed. */
export const NOT_MONITORED = "Not monitored";
