/** Shared constants — no magic strings for compared/repeated literals. */

export const PRODUCT_NAME = 'App Register';

export const PRODUCT_TAGLINE =
  'The renewal and ownership register for a one-to-five-person IT team.';

export const ROUTES = {
  home: '/',
} as const;

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
