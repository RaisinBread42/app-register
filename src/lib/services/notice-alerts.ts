import {and, asc, eq, ne} from 'drizzle-orm';
import {NOTICE_ALERT_STATUS, NOTICE_ALERT_STATUSES} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {apps, noticeAlerts} from '@/lib/db/schema';
import {upcomingAlertsForDeadline} from '@/lib/notice-alerts';
import {NotFoundError, ValidationError} from './errors';

export type NoticeAlertQuery = {status?: string | null; appId?: string | null};

/** JSON shape of a notice alert in the API. */
export type NoticeAlertView = {
  id: string;
  appId: string;
  appName: string;
  noticeDeadline: string;
  offsetDays: number;
  dueOn: string;
  status: string;
  sentAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** One `scheduled` alert per offset whose due date is today or later. */
export async function scheduleAlerts(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  noticeDeadline: string,
  today: string,
): Promise<void> {
  const upcoming = upcomingAlertsForDeadline(noticeDeadline, today);
  if (upcoming.length === 0) {
    return;
  }
  await db
    .insert(noticeAlerts)
    .values(
      upcoming.map((alert) => ({
        id: newId(),
        workspaceId,
        appId,
        noticeDeadline,
        ...alert,
      })),
    )
    // A sent or acknowledged alert for the same deadline and offset already covers it.
    .onConflictDoNothing();
}

export async function removeScheduledAlerts(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
): Promise<void> {
  await db
    .delete(noticeAlerts)
    .where(
      and(
        eq(noticeAlerts.workspaceId, workspaceId),
        eq(noticeAlerts.appId, appId),
        eq(noticeAlerts.status, NOTICE_ALERT_STATUS.scheduled),
      ),
    );
}

export async function listAlerts(
  db: AppDatabase,
  workspaceId: string,
  query: NoticeAlertQuery = {},
): Promise<NoticeAlertView[]> {
  const filters = [eq(noticeAlerts.workspaceId, workspaceId)];
  if (query.status) {
    if (!(NOTICE_ALERT_STATUSES as readonly string[]).includes(query.status)) {
      throw new ValidationError(`Unknown alert status: ${query.status}`);
    }
    filters.push(eq(noticeAlerts.status, query.status));
  }
  if (query.appId) {
    if (!isUuid(query.appId)) {
      throw new ValidationError('appId must be an app id');
    }
    filters.push(eq(noticeAlerts.appId, query.appId));
  }
  return selectAlertViews(db)
    .where(and(...filters))
    .orderBy(asc(noticeAlerts.dueOn), asc(apps.name));
}

export async function listAlertsForApp(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
): Promise<NoticeAlertView[]> {
  return listAlerts(db, workspaceId, {appId});
}

/** Marks an alert seen. Never touches the app or its deadline. */
export async function acknowledgeAlert(
  db: AppDatabase,
  workspaceId: string,
  id: string,
  now = new Date(),
): Promise<NoticeAlertView> {
  await getAlert(db, workspaceId, id);
  // The status condition keeps the first acknowledgement when two arrive at once.
  await db
    .update(noticeAlerts)
    .set({status: NOTICE_ALERT_STATUS.acknowledged, acknowledgedAt: now})
    .where(
      and(
        eq(noticeAlerts.workspaceId, workspaceId),
        eq(noticeAlerts.id, id),
        ne(noticeAlerts.status, NOTICE_ALERT_STATUS.acknowledged),
      ),
    );
  return getAlert(db, workspaceId, id);
}

/** One alert. 404 outside the workspace. */
export async function getAlert(
  db: AppDatabase,
  workspaceId: string,
  id: string,
): Promise<NoticeAlertView> {
  const [row] = isUuid(id)
    ? await selectAlertViews(db).where(
        and(eq(noticeAlerts.workspaceId, workspaceId), eq(noticeAlerts.id, id)),
      )
    : [];
  if (!row) {
    throw new NotFoundError('Notice alert not found');
  }
  return row;
}

function selectAlertViews(db: AppDatabase) {
  return db
    .select({
      id: noticeAlerts.id,
      appId: noticeAlerts.appId,
      appName: apps.name,
      noticeDeadline: noticeAlerts.noticeDeadline,
      offsetDays: noticeAlerts.offsetDays,
      dueOn: noticeAlerts.dueOn,
      status: noticeAlerts.status,
      sentAt: noticeAlerts.sentAt,
      acknowledgedAt: noticeAlerts.acknowledgedAt,
      acknowledgedById: noticeAlerts.acknowledgedById,
      createdAt: noticeAlerts.createdAt,
      updatedAt: noticeAlerts.updatedAt,
    })
    .from(noticeAlerts)
    .innerJoin(apps, eq(apps.id, noticeAlerts.appId))
    .$dynamic();
}
