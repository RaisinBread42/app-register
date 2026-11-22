import {
  APP_KINDS,
  APP_SORT,
  CENTS_PER_UNIT,
  NOTICE_ALERT_STATUS,
  type AppKind,
  type AppSort,
  type NoticeAlertStatus,
} from '@/lib/constants';

/** User-facing labels for the values the API uses. */

export const KIND_LABEL: Record<AppKind, string> = {
  saas: 'SaaS (bought)',
  in_house: 'In-house',
  citizen_built: 'Citizen-built',
  vendor_service: 'Vendor service',
};

export const KIND_OPTIONS = APP_KINDS.map((kind) => ({value: kind, label: KIND_LABEL[kind]}));

export const SORT_LABEL: Record<AppSort, string> = {
  [APP_SORT.name]: 'Name',
  [APP_SORT.noticeDeadline]: 'Notice deadline (soonest first)',
};

export const ALERT_STATUS_LABEL: Record<NoticeAlertStatus, string> = {
  [NOTICE_ALERT_STATUS.scheduled]: 'Scheduled',
  [NOTICE_ALERT_STATUS.sent]: 'Sent',
  [NOTICE_ALERT_STATUS.acknowledged]: 'Acknowledged',
};

export const NOT_SET = '—';

/** Shows an optional value, or a dash. */
export const orDash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? NOT_SET : String(value);

export function formatCost(costCents: number | null, billingCycle: string | null): string {
  if (costCents === null) {
    return NOT_SET;
  }
  const amount = (costCents / CENTS_PER_UNIT).toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  return billingCycle ? `${amount} · ${billingCycle}` : amount;
}
