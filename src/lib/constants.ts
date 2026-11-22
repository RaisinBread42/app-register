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
} as const;

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
