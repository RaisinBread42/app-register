import {and, desc, eq, inArray, lt, lte} from 'drizzle-orm';
import {
  ACTION_NOTE_MAX_LENGTH,
  ACTOR_SYSTEM,
  AUDIT_ACTION,
  AUDIT_PAGE_DEFAULT,
  AUDIT_PAGE_MAX,
  AUDIT_SUBJECT,
  MATCH_STATUS,
  MATCH_STATUSES,
  type AuditAction,
  type AuditSubject,
  type MatchStatus,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {appNoticeMatches, auditEvents, type AppNoticeMatchRow} from '@/lib/db/schema';
import {todayIso} from '@/lib/notice-alerts';
import {NotFoundError, ValidationError} from './errors';
import {assertActivePeople} from './people';
import {optionalDate, optionalText} from './validation';

/**
 * The action workflow (spec §3 P0): review, snooze with a reason, mark handled with
 * evidence, reopen, assign an owner, and undo. Status is per notice per app and never
 * touches severity (an acknowledged critical issue stays critical). Every action
 * appends an audit event; nothing in the history is ever rewritten.
 */

export type StatusChange = {status: string; note?: string | null; snoozedUntil?: string | null};
export type Assignment = {assigneeId: string | null; note?: string | null};

const MATCH_NOT_FOUND = 'Notice match not found';
/** The actions an undo can reverse: the latest of these on a match. */
const UNDOABLE: readonly AuditAction[] = [AUDIT_ACTION.noticeStatusChanged, AUDIT_ACTION.noticeAssigned];

/** Moves one notice-on-an-app to a new status, with the note the status needs, and records it. */
export async function changeMatchStatus(
  db: AppDatabase,
  workspaceId: string,
  matchId: string,
  change: StatusChange,
  actor: string,
  now = new Date(),
  today = todayIso(),
): Promise<void> {
  const status = matchStatus(change.status);
  const note = actionNote(change.note);
  const snoozedUntil = optionalDate(change.snoozedUntil, 'snooze date');
  if (status === MATCH_STATUS.snoozed) {
    if (!snoozedUntil || snoozedUntil <= today) {
      throw new ValidationError('A snooze needs a date after today');
    }
    if (!note) {
      throw new ValidationError('A snooze needs a reason');
    }
  }
  if (status === MATCH_STATUS.handled && !note) {
    throw new ValidationError('Marking it handled needs a note with the evidence');
  }
  await db.transaction(async (tx) => {
    const current = await lockMatch(tx, workspaceId, matchId);
    const until = status === MATCH_STATUS.snoozed ? snoozedUntil : null;
    await tx
      .update(appNoticeMatches)
      .set({status, statusNote: note, snoozedUntil: until, statusChangedAt: now})
      .where(eq(appNoticeMatches.id, current.id));
    await recordEvent(tx, workspaceId, current, {
      action: AUDIT_ACTION.noticeStatusChanged,
      actor,
      fromValue: current.status,
      toValue: status,
      snoozedUntil: until,
      note,
      now,
    });
  });
}

/** Assigns an active person to a notice-on-an-app (or clears it with null), and records it. */
export async function assignMatch(
  db: AppDatabase,
  workspaceId: string,
  matchId: string,
  assignment: Assignment,
  actor: string,
  now = new Date(),
): Promise<void> {
  const assigneeId = assignment.assigneeId ?? null;
  if (assigneeId !== null && !isUuid(assigneeId)) {
    throw new ValidationError('assigneeId must be a person id or null');
  }
  if (assigneeId) {
    await assertActivePeople(db, workspaceId, [assigneeId]);
  }
  const note = actionNote(assignment.note);
  await db.transaction(async (tx) => {
    const current = await lockMatch(tx, workspaceId, matchId);
    await tx.update(appNoticeMatches).set({assigneeId}).where(eq(appNoticeMatches.id, current.id));
    await recordEvent(tx, workspaceId, current, {
      action: AUDIT_ACTION.noticeAssigned,
      actor,
      fromValue: current.assigneeId,
      toValue: assigneeId,
      snoozedUntil: null,
      note,
      now,
    });
  });
}

/**
 * Reverses the latest status change or assignment on a match by writing a new event
 * that restores what it replaced; the original event stays. A snooze is only brought
 * back when its date is still ahead; otherwise the undo is refused as unsafe.
 */
export async function undoLastAction(
  db: AppDatabase,
  workspaceId: string,
  matchId: string,
  actor: string,
  now = new Date(),
  today = todayIso(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await lockMatch(tx, workspaceId, matchId);
    const history = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, workspaceId),
          eq(auditEvents.subjectId, current.id),
          inArray(auditEvents.action, [...UNDOABLE, AUDIT_ACTION.noticeUndone]),
        ),
      )
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.createdAt));
    const last = history[0];
    if (!last || last.action === AUDIT_ACTION.noticeUndone) {
      throw new ValidationError('There is nothing to undo');
    }
    if (last.action === AUDIT_ACTION.noticeAssigned) {
      await tx.update(appNoticeMatches).set({assigneeId: last.fromValue}).where(eq(appNoticeMatches.id, current.id));
      await recordEvent(tx, workspaceId, current, {
        action: AUDIT_ACTION.noticeUndone,
        actor,
        fromValue: current.assigneeId,
        toValue: last.fromValue,
        snoozedUntil: null,
        note: 'Undid the assignment',
        now,
      });
      return;
    }
    const previous = (last.fromValue ?? MATCH_STATUS.new) as MatchStatus;
    const earlier = history.slice(1).find((event) => event.action === AUDIT_ACTION.noticeStatusChanged && event.toValue === previous);
    const until = previous === MATCH_STATUS.snoozed ? (earlier?.snoozedUntil ?? null) : null;
    if (previous === MATCH_STATUS.snoozed && (!until || until <= today)) {
      throw new ValidationError('The snooze this would bring back has already ended, so it cannot be undone');
    }
    await tx
      .update(appNoticeMatches)
      .set({status: previous, statusNote: earlier?.note ?? null, snoozedUntil: until, statusChangedAt: now})
      .where(eq(appNoticeMatches.id, current.id));
    await recordEvent(tx, workspaceId, current, {
      action: AUDIT_ACTION.noticeUndone,
      actor,
      fromValue: current.status,
      toValue: previous,
      snoozedUntil: until,
      note: 'Undid the status change',
      now,
    });
  });
}

/** Snoozes whose date has come go back to new, each with an audit event (the daily job). */
export async function endExpiredSnoozes(db: AppDatabase, workspaceId: string, now = new Date(), today = todayIso()): Promise<number> {
  return db.transaction(async (tx) => {
    const ended = await tx
      .update(appNoticeMatches)
      .set({status: MATCH_STATUS.new, snoozedUntil: null, statusNote: null, statusChangedAt: now})
      .where(
        and(
          eq(appNoticeMatches.workspaceId, workspaceId),
          eq(appNoticeMatches.status, MATCH_STATUS.snoozed),
          lte(appNoticeMatches.snoozedUntil, today),
        ),
      )
      .returning();
    for (const match of ended) {
      await recordEvent(tx, workspaceId, match, {
        action: AUDIT_ACTION.noticeSnoozeEnded,
        actor: ACTOR_SYSTEM,
        fromValue: MATCH_STATUS.snoozed,
        toValue: MATCH_STATUS.new,
        snoozedUntil: null,
        note: null,
        now,
      });
    }
    return ended.length;
  });
}

/** The status a reader sees: a snooze whose date has come reads as new, even before the daily job records it. */
export function effectiveStatus(match: Pick<AppNoticeMatchRow, 'status' | 'snoozedUntil'>, today = todayIso()): MatchStatus {
  if (match.status === MATCH_STATUS.snoozed && match.snoozedUntil !== null && match.snoozedUntil <= today) {
    return MATCH_STATUS.new;
  }
  return match.status as MatchStatus;
}

// --- Audit history --------------------------------------------------------------

export type AuditEventView = {
  id: string;
  occurredAt: Date;
  actor: string;
  action: AuditAction;
  subjectKind: AuditSubject;
  subjectId: string;
  appId: string | null;
  noticeId: string | null;
  fromValue: string | null;
  toValue: string | null;
  snoozedUntil: string | null;
  note: string | null;
};

export type AuditQuery = {appId?: string | null; noticeId?: string | null; matchId?: string | null; limit?: string | null; before?: string | null};

/** Audit events, newest first, filtered by app, notice or match; `before` (an ISO time) pages back. */
export async function listAuditEvents(db: AppDatabase, workspaceId: string, query: AuditQuery = {}): Promise<AuditEventView[]> {
  for (const [name, value] of [['appId', query.appId], ['noticeId', query.noticeId], ['matchId', query.matchId]] as const) {
    if (value && !isUuid(value)) {
      throw new ValidationError(`${name} must be an id`);
    }
  }
  const limit = query.limit ? Number(query.limit) : AUDIT_PAGE_DEFAULT;
  if (!Number.isInteger(limit) || limit < 1 || limit > AUDIT_PAGE_MAX) {
    throw new ValidationError(`limit must be a whole number from 1 to ${AUDIT_PAGE_MAX}`);
  }
  const before = query.before ? new Date(query.before) : null;
  if (before && Number.isNaN(before.getTime())) {
    throw new ValidationError('before must be a date-time');
  }
  const rows = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.workspaceId, workspaceId),
        query.appId ? eq(auditEvents.appId, query.appId) : undefined,
        query.noticeId ? eq(auditEvents.noticeId, query.noticeId) : undefined,
        query.matchId ? eq(auditEvents.subjectId, query.matchId) : undefined,
        before ? lt(auditEvents.occurredAt, before) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt,
    actor: row.actor,
    action: row.action as AuditAction,
    subjectKind: row.subjectKind as AuditSubject,
    subjectId: row.subjectId,
    appId: row.appId,
    noticeId: row.noticeId,
    fromValue: row.fromValue,
    toValue: row.toValue,
    snoozedUntil: row.snoozedUntil,
    note: row.note,
  }));
}

/** Records something done to an app (archive, unarchive) in the same history. */
export async function recordAppEvent(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  event: {action: AuditAction; actor: string; fromValue: string | null; toValue: string | null; note: string | null},
  now = new Date(),
): Promise<void> {
  await db.insert(auditEvents).values({
    id: newId(),
    workspaceId,
    occurredAt: now,
    subjectKind: AUDIT_SUBJECT.app,
    subjectId: appId,
    appId,
    noticeId: null,
    snoozedUntil: null,
    ...event,
  });
}

async function recordEvent(
  tx: AppDatabase,
  workspaceId: string,
  match: Pick<AppNoticeMatchRow, 'id' | 'appId' | 'noticeId'>,
  event: {action: AuditAction; actor: string; fromValue: string | null; toValue: string | null; snoozedUntil: string | null; note: string | null; now: Date},
): Promise<void> {
  const {now, ...values} = event;
  await tx.insert(auditEvents).values({
    id: newId(),
    workspaceId,
    occurredAt: now,
    subjectKind: AUDIT_SUBJECT.noticeMatch,
    subjectId: match.id,
    appId: match.appId,
    noticeId: match.noticeId,
    ...values,
  });
}

/** The match, locked for this transaction so two actions at once are applied one after the other. */
async function lockMatch(tx: AppDatabase, workspaceId: string, matchId: string): Promise<AppNoticeMatchRow> {
  const [row] = isUuid(matchId)
    ? await tx
        .select()
        .from(appNoticeMatches)
        .where(and(eq(appNoticeMatches.workspaceId, workspaceId), eq(appNoticeMatches.id, matchId)))
        .for('update')
    : [];
  if (!row) {
    throw new NotFoundError(MATCH_NOT_FOUND);
  }
  return row;
}

function matchStatus(value: unknown): MatchStatus {
  if (!(MATCH_STATUSES as readonly unknown[]).includes(value)) {
    throw new ValidationError(`status must be one of: ${MATCH_STATUSES.join(', ')}`);
  }
  return value as MatchStatus;
}

function actionNote(value: unknown): string | null {
  const note = optionalText(value, 'note')?.trim() || null;
  if (note && note.length > ACTION_NOTE_MAX_LENGTH) {
    throw new ValidationError(`A note can be at most ${ACTION_NOTE_MAX_LENGTH} characters`);
  }
  return note;
}

