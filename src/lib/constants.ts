/** Shared constants — no magic strings for compared/repeated literals. */

export const PRODUCT_NAME = 'App Register';

export const PRODUCT_TAGLINE =
  'The renewal and ownership register for a one-to-five-person IT team.';

export const ROUTES = {
  home: '/',
  applications: '/applications',
  sources: '/sources',
  settings: '/settings',
  people: '/people',
} as const;

/** Paths from the first UI; each page there redirects to its new home. */
export const LEGACY_ROUTES = {
  apps: '/apps',
  notices: '/notices',
} as const;

/** `/applications/:id` and `/applications/:id/edit`; the id is encoded so it can never leave its path segment. */
export function appRoute(id: string): string {
  return `${ROUTES.applications}/${encodeURIComponent(id)}`;
}
export function editAppRoute(id: string): string {
  return `${appRoute(id)}/edit`;
}
export function appTabRoute(id: string, tab: AppTab): string {
  return `${appRoute(id)}?${new URLSearchParams({[UI_QUERY.tab]: tab})}`;
}

/** Query parameters the UI pages read. */
export const UI_QUERY = {
  tab: 'tab',
  /** Search text the topbar hands to the applications list. */
  search: 'q',
  /** `?add=1` opens the add-application dialog on the applications list. */
  add: 'add',
} as const;
export const UI_QUERY_ON = '1';

/** Tabs on the application detail page. */
export const APP_TAB = {
  overview: 'overview',
  dependencies: 'dependencies',
  hosting: 'hosting',
  licence: 'licence',
} as const;
export const APP_TABS = Object.values(APP_TAB);
export type AppTab = (typeof APP_TABS)[number];

/** Health filter of the applications list. */
export const APP_HEALTH_FILTER = {
  attention: 'attention',
  healthy: 'healthy',
} as const;

/** Sort orders of the applications list (sorted in the browser over the loaded apps). */
export const APP_LIST_SORT = {
  health: 'health',
  name: 'name',
  renewal: 'renewal',
} as const;
export const APP_LIST_SORTS = Object.values(APP_LIST_SORT);
export type AppListSort = (typeof APP_LIST_SORTS)[number];

/** How many rows the overview's short lists show. */
export const OVERVIEW_LIST_LIMIT = 5;

/** Environment variables the UI server reads. Never exposed to the browser. */
export const ENV = {
  /** Base URL of this app; the UI server calls `${APP_URL}/api/*`. */
  appUrl: 'APP_URL',
  /** Bearer key the UI server sends to the API (`npm run api-key:create -- "UI"`). */
  apiKey: 'APP_REGISTER_API_KEY',
  /** Shared password for HTTP Basic auth on every UI route (temporary until sign-in). */
  uiPassword: 'UI_PASSWORD',
} as const;

/** Every JSON API path starts with this; the UI's Basic auth never applies to it. */
export const API_PATH_PREFIX = '/api';

/** JSON API collections the UI's API client calls (item paths add `/:id`). */
export const API_ROUTES = {
  apps: `${API_PATH_PREFIX}/apps`,
  people: `${API_PATH_PREFIX}/people`,
  noticeAlerts: `${API_PATH_PREFIX}/notice-alerts`,
} as const;

/** Path segments under `/api/apps/:id` and `/api/notice-alerts/:id`. */
export const API_SUB_ROUTE = {
  archive: 'archive',
  dependencies: 'dependencies',
  hosting: 'hosting',
  acknowledge: 'acknowledge',
  /** `POST /api/apps/:id/dependencies/import` */
  import: 'import',
  /** `POST /api/apps/:id/dependencies/refresh` */
  refresh: 'refresh',
} as const;

/** `POST` here re-checks every active app's dependencies; the daily scheduled job calls it. */
export const API_MONITORING_DEPENDENCIES_REFRESH = `${API_PATH_PREFIX}/monitoring/dependencies/refresh`;

/** What the UI's Basic auth check decides for a request. */
export const BASIC_AUTH_VERDICT = {
  allow: 'allow',
  refuse: 'refuse',
  notConfigured: 'not-configured',
} as const;
export type BasicAuthVerdict = (typeof BASIC_AUTH_VERDICT)[keyof typeof BASIC_AUTH_VERDICT];

/** Realm named in the browser's Basic auth prompt. Any username is accepted; only the password is checked. */
export const UI_BASIC_AUTH_REALM = 'App Register';
export const BASIC_PREFIX = 'Basic ';

/** Notice-deadline alert offsets in days (MVP email alerts). */
export const NOTICE_ALERT_OFFSET_DAYS = [90, 60, 30] as const;

export const APP_KINDS = [
  'saas',
  'in_house',
  'citizen_built',
  'vendor_service',
] as const;

export type AppKind = (typeof APP_KINDS)[number];

/** Kinds that must record where they run, the data and keys they touch, and what breaks if they stop. */
export const RUNTIME_DETAIL_KINDS: readonly AppKind[] = ['in_house', 'citizen_built'];

/** The one workspace every request uses until sign-in exists. */
export const DEFAULT_WORKSPACE_SLUG = 'default';
export const DEFAULT_WORKSPACE_NAME = 'Default workspace';

export const PERSON_STATUS = {
  active: 'active',
  left: 'left',
} as const;
export const PERSON_STATUSES = Object.values(PERSON_STATUS);
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const NOTICE_ALERT_STATUS = {
  scheduled: 'scheduled',
  sent: 'sent',
  acknowledged: 'acknowledged',
} as const;
export const NOTICE_ALERT_STATUSES = Object.values(NOTICE_ALERT_STATUS);
export type NoticeAlertStatus = (typeof NOTICE_ALERT_STATUSES)[number];

export const OWNERSHIP_ROLE = {
  owner: 'owner',
  backupOwner: 'backup_owner',
} as const;
export const OWNERSHIP_ROLES = Object.values(OWNERSHIP_ROLE);

export const OWNERSHIP_CHANGE_REASON = {
  leaver: 'leaver',
  manual: 'manual',
} as const;
export const OWNERSHIP_CHANGE_REASONS = Object.values(OWNERSHIP_CHANGE_REASON);

/** Sort orders accepted by `GET /api/apps?sort=`. */
export const APP_SORT = {
  name: 'name',
  noticeDeadline: 'notice_deadline',
} as const;
export const APP_SORTS = Object.values(APP_SORT);
export type AppSort = (typeof APP_SORTS)[number];

/** Query parameter names the JSON API reads. */
export const API_QUERY = {
  kind: 'kind',
  sort: 'sort',
  noticeDeadlineWithinDays: 'noticeDeadlineWithinDays',
  status: 'status',
  appId: 'appId',
} as const;

/** Postgres error codes the services translate into user errors. */
export const PG_ERROR_CODE = {
  uniqueViolation: '23505',
} as const;

/** HTTP headers the API reads. */
export const API_HEADER = {
  authorization: 'authorization',
  idempotencyKey: 'idempotency-key',
  contentType: 'content-type',
  contentLength: 'content-length',
  userAgent: 'user-agent',
  wwwAuthenticate: 'www-authenticate',
} as const;

export const JSON_CONTENT_TYPE = 'application/json';

/** HTTP status codes the API answers with and the UI reacts to. */
export const HTTP_STATUS = {
  ok: 200,
  created: 201,
  noContent: 204,
  badRequest: 400,
  unauthorized: 401,
  notFound: 404,
  unprocessable: 422,
  serverError: 500,
  serviceUnavailable: 503,
} as const;

export const BEARER_PREFIX = 'Bearer ';

/** Every API key starts with this, so a leaked one is easy to spot in code or logs. */
export const API_KEY_PREFIX = 'ar_';

/** How long a stored Idempotency-Key replays its first response. */
export const IDEMPOTENCY_KEY_TTL_HOURS = 24;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

export const HTTP_METHOD = {
  get: 'GET',
  post: 'POST',
  patch: 'PATCH',
  delete: 'DELETE',
} as const;

/** Methods that must send an Idempotency-Key. */
export const IDEMPOTENT_METHODS = [HTTP_METHOD.post, HTTP_METHOD.patch] as const;

/** Widest `noticeDeadlineWithinDays` window (100 years); wider is a 400 from the API. */
export const NOTICE_WINDOW_MAX_DAYS = 36_500;

/** Selector value meaning "no filter" on list pages. */
export const FILTER_ALL = 'all';

/** The API stores money as whole cents; the UI shows and takes currency units. */
export const CENTS_PER_UNIT = 100;

/** How a dependency got on an app. An import only ever removes rows it created itself. */
export const DEPENDENCY_SOURCE = {
  manual: 'manual',
  import: 'import',
} as const;
export const DEPENDENCY_SOURCES = Object.values(DEPENDENCY_SOURCE);
export type DependencySource = (typeof DEPENDENCY_SOURCES)[number];

/** Largest package.json / package-lock.json the import accepts (5 MB of text). */
export const DEPENDENCY_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** Why the last registry check of a dependency gave no full answer. */
export const DEPENDENCY_CHECK_ERROR = {
  /** Not on the public npm registry: private, misspelt, or not an npm package. */
  notFound: 'not_found',
  /** The registry or advisory source did not answer; the previous result is kept. */
  unavailable: 'unavailable',
  /** The tracked version is a range or tag, so advisories cannot be matched to it. */
  invalidVersion: 'invalid_version',
} as const;
export const DEPENDENCY_CHECK_ERRORS = Object.values(DEPENDENCY_CHECK_ERROR);
export type DependencyCheckError = (typeof DEPENDENCY_CHECK_ERRORS)[number];

export const ADVISORY_SEVERITY = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  /** The advisory source gave no severity. */
  unknown: 'unknown',
} as const;
export const ADVISORY_SEVERITIES = Object.values(ADVISORY_SEVERITY);
export type AdvisorySeverity = (typeof ADVISORY_SEVERITIES)[number];

/** What an app's health score is made of. Each dimension reports its own deductions. */
export const HEALTH_DIMENSION = {
  dependencies: 'dependencies',
  hosting: 'hosting',
  licence: 'licence',
  pricing: 'pricing',
} as const;
export const HEALTH_DIMENSIONS = Object.values(HEALTH_DIMENSION);
export type HealthDimension = (typeof HEALTH_DIMENSIONS)[number];

export const HEALTH_STATUS = {
  ok: 'ok',
  attention: 'attention',
  critical: 'critical',
  /** Nothing recorded to check. */
  na: 'na',
} as const;
export const HEALTH_STATUSES = Object.values(HEALTH_STATUS);
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

/** A score starts here and loses points per deduction, never going below zero. */
export const HEALTH_MAX_SCORE = 100;
/** Below this a score is `critical`. */
export const HEALTH_CRITICAL_BELOW = 80;
/** Below this (and not critical) a score is `attention`; at or above it the app is healthy. */
export const HEALTH_ATTENTION_BELOW = 95;

/** Points one known advisory costs, by severity. Unknown severity counts as medium so it is never ignored. */
export const ADVISORY_POINTS: Record<AdvisorySeverity, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 0,
  unknown: 2,
};
/** Points a runtime dependency costs when its tracked version is a major / a minor version behind the latest. */
export const MAJOR_BEHIND_POINTS = 3;
export const MINOR_BEHIND_POINTS = 1;

export const VERSION_LAG = {
  major: 'major',
  minor: 'minor',
} as const;
export type VersionLag = (typeof VERSION_LAG)[keyof typeof VERSION_LAG];

/** The free, keyless sources dependency monitoring reads. Only package names and versions are ever sent. */
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
export const OSV_API_URL = 'https://api.osv.dev/v1';
export const OSV_ADVISORY_PAGE_URL = 'https://osv.dev/vulnerability';
export const OSV_ECOSYSTEM_NPM = 'npm';
/** Sent as User-Agent on every monitoring request. No personal or workspace data. */
export const MONITORING_USER_AGENT = 'app-register';
export const MONITORING_TIMEOUT_MS = 8_000;
/** At most this many monitoring requests are in flight at once. */
export const MONITORING_CONCURRENCY = 6;
/** OSV accepts up to 1000 queries per batch. */
export const OSV_BATCH_SIZE = 500;
