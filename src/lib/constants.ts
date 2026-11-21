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
