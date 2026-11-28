import {AUDIT_ACTION, MATCH_STATUS, type MatchStatus} from '@/lib/constants';
import type {AuditEvent} from './api-client';
import {AUDIT_ACTION_LABEL, MATCH_STATUS_LABEL} from './copy';
import {formatDate, formatDateTime} from './register-view';

/** What happened, in words: who, what, to which notice on which app (or which app), and the new status when there is one. */
export function activitySummary(event: AuditEvent): string {
  const until = event.toValue === MATCH_STATUS.snoozed && event.snoozedUntil ? ` until ${formatDate(event.snoozedUntil)}` : '';
  const status = event.toValue && event.toValue in MATCH_STATUS_LABEL ? ` (now ${MATCH_STATUS_LABEL[event.toValue as MatchStatus]}${until})` : '';
  const target =
    event.action === AUDIT_ACTION.appArchived
      ? (event.appName ?? 'an application')
      : `${event.noticeTitle ? `“${event.noticeTitle}”` : 'a notice'}${event.appName ? ` on ${event.appName}` : ''}`;
  return `${event.actor} ${AUDIT_ACTION_LABEL[event.action]} ${target}${status}`;
}

/** One history line for short lists: when, then the summary. */
export function activityLine(event: AuditEvent): string {
  return `${formatDateTime(event.occurredAt)} · ${activitySummary(event)}`;
}
