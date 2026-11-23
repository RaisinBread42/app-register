import {and, eq, lt, sql} from 'drizzle-orm';
import {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_TTL_HOURS,
  RESOURCE_KIND,
  type ResourceKind,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {idempotencyKeys} from '@/lib/db/schema';
import {sha256Hex} from '@/lib/hash';
import type {ImportSummary} from './dependency-import';
import {IdempotencyConflictError, ValidationError} from './errors';

/**
 * What a write answered about, so a repeat of the request can be answered from
 * the tables: the row it created or changed, or the counts of an import (which
 * has no row of its own; `id` is then the app that was imported into).
 */
export type WrittenResource =
  | {kind: Exclude<ResourceKind, typeof RESOURCE_KIND.dependencyImport>; id: string}
  | {kind: typeof RESOURCE_KIND.dependencyImport; id: string; counts: ImportSummary};

/** `resource` is set by every POST and PATCH that runs once per Idempotency-Key. */
export type ApiResult = {status: number; body: unknown; resource?: WrittenResource};

/**
 * Either the write ran now (`result`), or it ran before and this is what was
 * recorded then: the status it answered with and the resource it was about.
 */
export type RunOnceResult =
  | {isReplay: false; result: ApiResult}
  | {isReplay: true; status: number; resource: WrittenResource};

type StoredKey = typeof idempotencyKeys.$inferSelect;

/** Claim, or read what another request stored; twice covers a key swept in between. */
const CLAIM_ATTEMPTS = 2;

/**
 * Runs a write at most once per Idempotency-Key.
 *
 * The key is claimed inside the same transaction as the write. A second request
 * with the same key waits on that claim; once the first commits it gets what the
 * first recorded instead of running again. If the first fails, nothing is
 * stored and a retry runs normally. Only successful (2xx) writes are recorded.
 * No response body is kept: only the status code, the kind and id of the row
 * the write was about, and an import's counts. The caller answers a repeat by
 * reading that row again. Expired keys are swept from every workspace on each write.
 */
export async function runOnce(
  db: AppDatabase,
  workspaceId: string,
  key: string | null,
  request: {method: string; path: string; body: string},
  write: (tx: AppDatabase) => Promise<ApiResult>,
): Promise<RunOnceResult> {
  if (!key || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new ValidationError(
      `An Idempotency-Key header (1 to ${IDEMPOTENCY_KEY_MAX_LENGTH} characters) is required`,
    );
  }
  const requestHash = hashRequest(request);

  return db.transaction(async (tx) => {
    await tx
      .delete(idempotencyKeys)
      .where(
        lt(
          idempotencyKeys.createdAt,
          sql`now() - make_interval(hours => ${IDEMPOTENCY_KEY_TTL_HOURS})`,
        ),
      );

    // A stored key can expire and be swept by another request between our claim
    // attempt and our read of it; then we claim it again and run as new.
    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
      const claimed = await tx
        .insert(idempotencyKeys)
        .values({workspaceId, key, requestHash, statusCode: 0})
        .onConflictDoNothing()
        .returning({key: idempotencyKeys.key});
      if (claimed.length > 0) {
        return {isReplay: false, result: await runAndRecord(tx, workspaceId, key, write)};
      }
      const stored = await findStored(tx, workspaceId, key);
      if (stored) {
        return {isReplay: true, status: stored.statusCode, resource: recorded(stored, requestHash)};
      }
    }
    throw new Error('Could not claim the Idempotency-Key');
  });
}

async function runAndRecord(
  tx: AppDatabase,
  workspaceId: string,
  key: string,
  write: (tx: AppDatabase) => Promise<ApiResult>,
): Promise<ApiResult> {
  const result = await write(tx);
  const {resource} = result;
  if (!resource) {
    throw new Error('A write that runs once per Idempotency-Key must say which resource it answered about');
  }
  const counts = resource.kind === RESOURCE_KIND.dependencyImport ? resource.counts : null;
  await tx
    .update(idempotencyKeys)
    .set({
      statusCode: result.status,
      resourceKind: resource.kind,
      resourceId: resource.id,
      countAdded: counts?.added,
      countUpdated: counts?.updated,
      countUnchanged: counts?.unchanged,
      countRemoved: counts?.removed,
    })
    .where(and(eq(idempotencyKeys.workspaceId, workspaceId), eq(idempotencyKeys.key, key)));
  return result;
}

async function findStored(db: AppDatabase, workspaceId: string, key: string): Promise<StoredKey | undefined> {
  const [stored] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.workspaceId, workspaceId), eq(idempotencyKeys.key, key)));
  return stored;
}

/** What the first run of this request recorded; a 422 when the key was used for another request. */
function recorded(stored: StoredKey, requestHash: string): WrittenResource {
  if (stored.requestHash !== requestHash) {
    throw new IdempotencyConflictError(
      'This Idempotency-Key was already used for a different request',
    );
  }
  const {resourceKind: kind, resourceId: id} = stored;
  if (kind === null || id === null) {
    throw new Error('A committed Idempotency-Key has no resource');
  }
  if (kind !== RESOURCE_KIND.dependencyImport) {
    return {kind, id};
  }
  return {
    kind,
    id,
    counts: {
      added: stored.countAdded ?? 0,
      updated: stored.countUpdated ?? 0,
      unchanged: stored.countUnchanged ?? 0,
      removed: stored.countRemoved ?? 0,
    },
  };
}

function hashRequest(request: {method: string; path: string; body: string}): string {
  return sha256Hex(`${request.method}\n${request.path}\n${request.body}`);
}
