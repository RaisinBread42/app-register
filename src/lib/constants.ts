/** Shared constants — no magic strings for compared/repeated literals. */

export const PRODUCT_NAME = 'App Register';

export const PRODUCT_TAGLINE =
  'The renewal and ownership register for a one-to-five-person IT team.';

export const ROUTES = {
  home: '/',
  apps: '/apps',
  newApp: '/apps/new',
  people: '/people',
  notices: '/notices',
} as const;

/** `/apps/:id` and `/apps/:id/edit`; the id is encoded so it can never leave its path segment. */
export function appRoute(id: string): string {
  return `${ROUTES.apps}/${encodeURIComponent(id)}`;
}
export function editAppRoute(id: string): string {
  return `${appRoute(id)}/edit`;
}

/** Query parameters the UI pages read (the apps list also forwards API_QUERY names). */
export const UI_QUERY = {
  tab: 'tab',
} as const;

/** Tabs on the app detail page. */
export const APP_TAB = {
  overview: 'overview',
  dependencies: 'dependencies',
  hosting: 'hosting',
  alerts: 'alerts',
} as const;
export const APP_TABS = Object.values(APP_TAB);
export type AppTab = (typeof APP_TABS)[number];

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

/** Methods that must send an Idempotency-Key. */
export const IDEMPOTENT_METHODS = ['POST', 'PATCH'] as const;

/** Selector value meaning "no filter" on list pages. */
export const FILTER_ALL = 'all';

/** The API stores money as whole cents; the UI shows and takes currency units. */
export const CENTS_PER_UNIT = 100;
