import {and, asc, eq, isNull, lte} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {ENV, MS_PER_DAY, NOTICE_ALERT_STATUS, PRODUCT_NAME, appRoute} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {apps, noticeAlerts, people} from '@/lib/db/schema';
import type {EmailPort} from '@/lib/email';
import {todayIso} from '@/lib/notice-alerts';
import {ValidationError} from './errors';

export type SendDueNoticeAlertsOptions = {
  email: EmailPort;
  from: string;
  /** Base URL for the app link in the email body. Optional when tests only check recipients. */
  appUrl?: string;
  today?: string;
  now?: Date;
};

export type SendDueNoticeAlertsResult = {sent: number};

type DueAlert = {
  id: string;
  appId: string;
  appName: string;
  noticeDeadline: string;
  offsetDays: number;
  dueOn: string;
  ownerEmail: string;
  backupEmail: string;
};

const owner = alias(people, 'owner');
const backupOwner = alias(people, 'backup_owner');

/**
 * Selects scheduled notice alerts whose due date is today or earlier (catch-up),
 * emails the owner and backup, and marks each alert `sent` at most once.
 * Claims the row before sending so concurrent runners cannot double-deliver;
 * a failed send releases the claim so the next run retries.
 * Logs never include email addresses (personal data).
 */
export async function sendDueNoticeAlerts(
  db: AppDatabase,
  workspaceId: string,
  options: SendDueNoticeAlertsOptions,
): Promise<SendDueNoticeAlertsResult> {
  const from = options.from.trim();
  if (!from) {
    throw new ValidationError(`${ENV.emailFrom} is required to send notice alerts`);
  }
  const today = options.today ?? todayIso();
  const now = options.now ?? new Date();
  const due = await listDueAlerts(db, workspaceId, today);

  let sent = 0;
  for (const alert of due) {
    if (!(await markSent(db, workspaceId, alert.id, now))) {
      continue;
    }
    try {
      await options.email.send(buildMessage(alert, from, today, options.appUrl));
      sent += 1;
    } catch (error: unknown) {
      await releaseClaim(db, workspaceId, alert.id);
      // Name and code only — the error message may quote the recipient address.
      console.error('notice alert send failed', {
        alertId: alert.id,
        name: error instanceof Error ? error.name : 'Error',
      });
    }
  }
  return {sent};
}

async function listDueAlerts(
  db: AppDatabase,
  workspaceId: string,
  today: string,
): Promise<DueAlert[]> {
  return db
    .select({
      id: noticeAlerts.id,
      appId: noticeAlerts.appId,
      appName: apps.name,
      noticeDeadline: noticeAlerts.noticeDeadline,
      offsetDays: noticeAlerts.offsetDays,
      dueOn: noticeAlerts.dueOn,
      ownerEmail: owner.email,
      backupEmail: backupOwner.email,
    })
    .from(noticeAlerts)
    .innerJoin(apps, and(eq(apps.id, noticeAlerts.appId), eq(apps.workspaceId, noticeAlerts.workspaceId)))
    .innerJoin(owner, and(eq(owner.id, apps.ownerId), eq(owner.workspaceId, apps.workspaceId)))
    .innerJoin(
      backupOwner,
      and(eq(backupOwner.id, apps.backupOwnerId), eq(backupOwner.workspaceId, apps.workspaceId)),
    )
    .where(
      and(
        eq(noticeAlerts.workspaceId, workspaceId),
        eq(noticeAlerts.status, NOTICE_ALERT_STATUS.scheduled),
        lte(noticeAlerts.dueOn, today),
        isNull(apps.archivedAt),
      ),
    )
    .orderBy(asc(noticeAlerts.dueOn), asc(apps.name), asc(noticeAlerts.offsetDays));
}

/** Marks `scheduled` → `sent`. Returns false when another runner already claimed it. */
async function markSent(
  db: AppDatabase,
  workspaceId: string,
  id: string,
  now: Date,
): Promise<boolean> {
  const updated = await db
    .update(noticeAlerts)
    .set({status: NOTICE_ALERT_STATUS.sent, sentAt: now})
    .where(
      and(
        eq(noticeAlerts.workspaceId, workspaceId),
        eq(noticeAlerts.id, id),
        eq(noticeAlerts.status, NOTICE_ALERT_STATUS.scheduled),
      ),
    )
    .returning({id: noticeAlerts.id});
  return updated.length > 0;
}

/** Puts a claimed alert back to `scheduled` so a later run can retry after a send failure. */
async function releaseClaim(db: AppDatabase, workspaceId: string, id: string): Promise<void> {
  await db
    .update(noticeAlerts)
    .set({status: NOTICE_ALERT_STATUS.scheduled, sentAt: null})
    .where(
      and(
        eq(noticeAlerts.workspaceId, workspaceId),
        eq(noticeAlerts.id, id),
        eq(noticeAlerts.status, NOTICE_ALERT_STATUS.sent),
      ),
    );
}

function buildMessage(
  alert: DueAlert,
  from: string,
  today: string,
  appUrl: string | undefined,
) {
  const recipients = uniqueEmails([alert.ownerEmail, alert.backupEmail]);
  const daysLeft = calendarDaysBetween(today, alert.noticeDeadline);
  const {subject, timing} = deadlineCopy(alert.appName, alert.noticeDeadline, daysLeft);
  const lines = [
    `${PRODUCT_NAME} reminder`,
    '',
    `The notice deadline for ${alert.appName} is ${alert.noticeDeadline}${timing}.`,
    'Give notice before that date to avoid an auto-renewal.',
  ];
  if (appUrl) {
    const base = appUrl.replace(/\/$/, '');
    lines.push('', `Open the app: ${base}${appRoute(alert.appId)}`);
  }
  return {from, to: recipients, subject, text: lines.join('\n')};
}

/** Subject and parenthetical timing from calendar days left, not the scheduled offset. */
function deadlineCopy(appName: string, noticeDeadline: string, daysLeft: number) {
  if (daysLeft > 0) {
    return {
      subject: `Notice deadline in ${daysLeft} days: ${appName}`,
      timing: ` (${daysLeft} days away)`,
    };
  }
  if (daysLeft === 0) {
    return {subject: `Notice deadline today: ${appName}`, timing: ' (today)'};
  }
  const ago = Math.abs(daysLeft);
  return {
    subject: `Notice deadline was ${noticeDeadline}: ${appName}`,
    timing: ` (${ago} days ago)`,
  };
}

function calendarDaysBetween(fromIso: string, toIso: string): number {
  const from = utcDay(fromIso);
  const to = utcDay(toIso);
  return Math.round((to - from) / MS_PER_DAY);
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}
