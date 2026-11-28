import {and, desc, eq, inArray, isNull, lt, lte} from 'drizzle-orm';
import {
  ACTION_NOTE_MAX_LENGTH,
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
import {appNoticeMatches, apps, auditEvents, type AppNoticeMatchRow} from '@/lib/db/schema';
import {todayIso} from '@/lib/notice-alerts';
import {SYSTEM_ACTOR, type Actor} from './actor';
import {NotFoundError, ValidationError} from './errors';
import {assertActivePeople} from './people';
import {optionalDate, optionalText} from './validation';

/**
 * The action workflow (spec §3 P0): review, snooze with a reason, mark handled with
 * evidence, reopen, assign an owner, and undo. Status is per notice per app and never
 * touches severity (an acknowledged critical issue stays critical). Every action
 * appends an audit event; the history is ordered by a database sequence and is never
 * rewritten (triggers refuse UPDATE, TRUNCATE and direct DELETE).
 */

export type StatusChange = {status: string; note?: string | null; snoozedUntil?: string | null};
export type Assignment = {assigneeId?: string | null; note?: string | null};
/**
 * Which action an Undo is for: the action and the value it set. Status and owner are
 * undone separately, so undoing a review after an assignment keeps the owner. When a
 * later change of the same kind has happened, Undo refuses, so an older confirmation
 * never reverses a newer change.
 */
export type UndoTarget = {action?: string; toValue?: string | null};

const UNDOABLE_ACTIONS: readonly AuditAction[] = [AUDIT_ACTION.noticeStatusChanged, AUDIT_ACTION.noticeAssigned];

const MATCH_NOT_FOUND = 'Notice match not found';
/** Events that set a match's status; the latest one says what the status became. */
const STATUS_EVENTS: readonly AuditAction[] = [
  AUDIT_ACTION.noticeStatusChanged,
  AUDIT_ACTION.noticeStatusUndone,
  AUDIT_ACTION.noticeSnoozeEnded,
  AUDIT_ACTION.noticeReopened,
];
const ASSIGNMENT_EVENTS: readonly AuditAction[] = [AUDIT_ACTION.noticeAssigned, AUDIT_ACTION.noticeAssignmentUndone];
/** Events an undo looks at: the latest one is what an undo with no target would reverse. */
const TIMELINE_EVENTS: readonly AuditAction[] = [...STATUS_EVENTS, ...ASSIGNMENT_EVENTS];

/** The events an undo for this target reads: one kind (status or owner) when it names an action, else both. */
function undoTimeline(target: UndoTarget): readonly AuditAction[] {
  if (target.action === AUDIT_ACTION.noticeStatusChanged) return STATUS_EVENTS;
  if (target.action === AUDIT_ACTION.noticeAssigned) return ASSIGNMENT_EVENTS;
  return TIMELINE_EVENTS;
}

type StatusState = {status: MatchStatus; snoozedUntil: string | null; note: string | null};
const INITIAL_STATE: StatusState = {status: MATCH_STATUS.new, snoozedUntil: null, note: null};

/** Moves one notice-on-an-app to a new status, with the note the status needs, and records it. */
export async function changeMatchStatus(
  db: AppDatabase,
  workspaceId: string,
  matchId: string,
  change: StatusChange,
  actor: Actor,
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
    const current = await lockMatch(tx, workspaceId, matchId, now, today);
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

/** Assigns an active person to a notice-on-an-app, or clears it with an explicit null, and records it. */
export async function assignMatch(
  db: AppDatabase,
  workspaceId: string,
  matchId: string,
  assignment: Assignment,
  actor: Actor,
  now = new Date(),
  today = todayIso(),
): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(assignment, 'assigneeId')) {
    throw new ValidationError('assigneeId is required: a person id, or null to clear the owner');
  }
  const assigneeId = assignment.assigneeId ?? null;
  if (assigneeId !== null && !isUuid(assigneeId)) {
    throw new ValidationError('assigneeId must be a person id or null');
  }
  if (assigneeId) {
    await assertActivePeople(db, workspaceId, [assigneeId]);
  }
  const note = actionNote(assignment.note);
  await db.transaction(async (tx) => {
    const current = await lockMatch(tx, workspaceId, matchId, now, today);
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
 * that restores what it replaced (status, snooze date and note, or the previous owner);
 * the original event stays. Refused when the latest event is not a person's action
 * (an undo, a snooze that ended, a reopen by the source), when it would bring back a
 * snooze whose date has passed, or an owner who has since left.
 */
export async function undoLastAction(
  db: AppDatabase,
  workspaceId: string,
  matchId: string,
  actor: Actor,
  target: UndoTarget = {},
  now = new Date(),
  today = todayIso(),
): Promise<void> {
  if (target.action !== undefined && !UNDOABLE_ACTIONS.includes(target.action as AuditAction)) {
    throw new ValidationError(`action must be one of: ${UNDOABLE_ACTIONS.join(', ')}`);
  }
  await db.transaction(async (tx) => {
    const current = await lockMatch(tx, workspaceId, matchId, now, today);
    const timeline = await tx
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.workspaceId, workspaceId), eq(auditEvents.subjectId, current.id), inArray(auditEvents.action, [...undoTimeline(target)])))
      .orderBy(desc(auditEvents.seq));
    const last = timeline[0];
    if (!last || !UNDOABLE_ACTIONS.includes(last.action as AuditAction)) {
      throw new ValidationError('There is nothing to undo');
    }
    if (target.action !== undefined && (last.action !== target.action || ('toValue' in target && last.toValue !== (target.toValue ?? null)))) {
      throw new ValidationError('A later change was made to this notice, so this Undo no longer applies');
    }
    if (last.action === AUDIT_ACTION.noticeAssigned) {
      if (last.fromValue) {
        await assertActivePeople(tx, workspaceId, [last.fromValue]).catch(() => {
          throw new ValidationError('The previous owner has left, so the assignment cannot be undone');
        });
      }
      await tx.update(appNoticeMatches).set({assigneeId: last.fromValue}).where(eq(appNoticeMatches.id, current.id));
      await recordEvent(tx, workspaceId, current, {
        action: AUDIT_ACTION.noticeAssignmentUndone,
        actor,
        fromValue: current.assigneeId,
        toValue: last.fromValue,
        snoozedUntil: null,
        note: null,
        now,
      });
      return;
    }
    const before = timeline.slice(1).find((event) => STATUS_EVENTS.includes(event.action as AuditAction));
    const previous: StatusState = before
      ? {status: before.toValue as MatchStatus, snoozedUntil: before.snoozedUntil, note: before.note}
      : INITIAL_STATE;
    if (previous.status === MATCH_STATUS.snoozed && (!previous.snoozedUntil || previous.snoozedUntil <= today)) {
      throw new ValidationError('The snooze this would bring back has already ended, so it cannot be undone');
    }
    await tx
      .update(appNoticeMatches)
      .set({status: previous.status, statusNote: previous.note, snoozedUntil: previous.snoozedUntil, statusChangedAt: now})
      .where(eq(appNoticeMatches.id, current.id));
    await recordEvent(tx, workspaceId, current, {
      action: AUDIT_ACTION.noticeStatusUndone,
      actor,
      fromValue: current.status,
      toValue: previous.status,
      snoozedUntil: previous.snoozedUntil,
      note: previous.note,
      now,
    });
  });
}

/** Snoozes whose date has come go back to new, each with an audit event (the daily job). */
export async function endExpiredSnoozes(db: AppDatabase, workspaceId: string, now = new Date(), today = todayIso()): Promise<number> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(appNoticeMatches)
      .where(and(eq(appNoticeMatches.workspaceId, workspaceId), eq(appNoticeMatches.status, MATCH_STATUS.snoozed), lte(appNoticeMatches.snoozedUntil, today)))
      .for('update');
    for (const match of due) {
      await endSnooze(tx, workspaceId, match, now);
    }
    return due.length;
  });
}

/** The status a reader sees: a snooze whose date has come reads as new, even before the daily job records it. */
export function effectiveStatus(match: Pick<AppNoticeMatchRow, 'status' | 'snoozedUntil'>, today = todayIso()): MatchStatus {
  if (match.status === MATCH_STATUS.snoozed && match.snoozedUntil !== null && match.snoozedUntil <= today) {
    return MATCH_STATUS.new;
  }
  return match.status as MatchStatus;
}

/** A handled notice the source reports again for the app is open again (spec: unhandled risk never hides). */
export async function reopenBySource(tx: AppDatabase, workspaceId: string, match: Pick<AppNoticeMatchRow, 'id' | 'appId' | 'noticeId' | 'status'>, now: Date): Promise<void> {
  await tx.update(appNoticeMatches).set({status: MATCH_STATUS.new, statusNote: null, snoozedUntil: null, statusChangedAt: now}).where(eq(appNoticeMatches.id, match.id));
  await recordEvent(tx, workspaceId, match, {
    action: AUDIT_ACTION.noticeReopened,
    actor: SYSTEM_ACTOR,
    fromValue: match.status,
    toValue: MATCH_STATUS.new,
    snoozedUntil: null,
    note: 'The source reports it again for this application',
    now,
  });
}

// --- Audit history --------------------------------------------------------------

export type AuditEventView = {
  id: string;
  occurredAt: Date;
  actor: string;
  actorKeyId: string | null;
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

/** Audit events, newest first, filtered by app, notice or match; `before` (an event id) pages back from that event. */
export async function listAuditEvents(db: AppDatabase, workspaceId: string, query: AuditQuery = {}): Promise<AuditEventView[]> {
  for (const [name, value] of [['appId', query.appId], ['noticeId', query.noticeId], ['matchId', query.matchId], ['before', query.before]] as const) {
    if (value && !isUuid(value)) {
      throw new ValidationError(`${name} must be an id`);
    }
  }
  const limit = query.limit ? Number(query.limit) : AUDIT_PAGE_DEFAULT;
  if (!Number.isInteger(limit) || limit < 1 || limit > AUDIT_PAGE_MAX) {
    throw new ValidationError(`limit must be a whole number from 1 to ${AUDIT_PAGE_MAX}`);
  }
  let beforeSeq: number | null = null;
  if (query.before) {
    const [cursor] = await db
      .select({seq: auditEvents.seq})
      .from(auditEvents)
      .where(and(eq(auditEvents.workspaceId, workspaceId), eq(auditEvents.id, query.before)));
    if (!cursor) {
      throw new ValidationError('before must be the id of an event in this workspace');
    }
    beforeSeq = cursor.seq;
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
        beforeSeq !== null ? lt(auditEvents.seq, beforeSeq) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.seq))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurredAt,
    actor: row.actor,
    actorKeyId: row.actorKeyId,
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

/** Records something done to an app (archiving) in the same history. */
export async function recordAppEvent(
  db: AppDatabase,
  workspaceId: string,
  appId: string,
  event: {action: AuditAction; actor: Actor; fromValue: string | null; toValue: string | null; note: string | null},
  now = new Date(),
): Promise<void> {
  const {actor, ...values} = event;
  await db.insert(auditEvents).values({
    id: newId(),
    workspaceId,
    occurredAt: now,
    actor: actor.name,
    actorKeyId: actor.keyId,
    subjectKind: AUDIT_SUBJECT.app,
    subjectId: appId,
    appId,
    noticeId: null,
    snoozedUntil: null,
    ...values,
  });
}

async function recordEvent(
  tx: AppDatabase,
  workspaceId: string,
  match: Pick<AppNoticeMatchRow, 'id' | 'appId' | 'noticeId'>,
  event: {action: AuditAction; actor: Actor; fromValue: string | null; toValue: string | null; snoozedUntil: string | null; note: string | null; now: Date},
): Promise<void> {
  const {now, actor, ...values} = event;
  await tx.insert(auditEvents).values({
    id: newId(),
    workspaceId,
    occurredAt: now,
    actor: actor.name,
    actorKeyId: actor.keyId,
    subjectKind: AUDIT_SUBJECT.noticeMatch,
    subjectId: match.id,
    appId: match.appId,
    noticeId: match.noticeId,
    ...values,
  });
}

async function endSnooze(tx: AppDatabase, workspaceId: string, match: AppNoticeMatchRow, now: Date): Promise<AppNoticeMatchRow> {
  const [ended] = await tx
    .update(appNoticeMatches)
    .set({status: MATCH_STATUS.new, snoozedUntil: null, statusNote: null, statusChangedAt: now})
    .where(eq(appNoticeMatches.id, match.id))
    .returning();
  await recordEvent(tx, workspaceId, match, {
    action: AUDIT_ACTION.noticeSnoozeEnded,
    actor: SYSTEM_ACTOR,
    fromValue: MATCH_STATUS.snoozed,
    toValue: MATCH_STATUS.new,
    snoozedUntil: null,
    note: null,
    now,
  });
  return ended;
}

/**
 * The match on an active app, locked for this transaction so actions on it apply one
 * after the other. A snooze whose date has come is ended first (recorded), so an action
 * starts from what the person saw.
 */
async function lockMatch(tx: AppDatabase, workspaceId: string, matchId: string, now: Date, today: string): Promise<AppNoticeMatchRow> {
  const [row] = isUuid(matchId)
    ? await tx
        .select({match: appNoticeMatches})
        .from(appNoticeMatches)
        .innerJoin(apps, and(eq(apps.id, appNoticeMatches.appId), isNull(apps.archivedAt)))
        .where(and(eq(appNoticeMatches.workspaceId, workspaceId), eq(appNoticeMatches.id, matchId)))
        .for('update', {of: appNoticeMatches})
    : [];
  if (!row) {
    throw new NotFoundError(MATCH_NOT_FOUND);
  }
  return effectiveStatus(row.match, today) === row.match.status ? row.match : endSnooze(tx, workspaceId, row.match, now);
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
