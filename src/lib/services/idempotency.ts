import {and, eq, lt, sql} from 'drizzle-orm';
import {IDEMPOTENCY_KEY_MAX_LENGTH, IDEMPOTENCY_KEY_TTL_HOURS} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {idempotencyKeys} from '@/lib/db/schema';
import {sha256Hex} from '@/lib/hash';
import {IdempotencyConflictError, ValidationError} from './errors';

export type ApiResult = {status: number; body: unknown};

/**
 * Runs a write at most once per Idempotency-Key.
 *
 * The key is claimed inside the same transaction as the write. A second request
 * with the same key waits on that claim; once the first commits it gets the
 * stored response instead of running again. If the first fails, nothing is
 * stored and a retry runs normally. Only successful (2xx) responses are stored.
 */
export async function runOnce(
  db: AppDatabase,
  workspaceId: string,
  key: string | null,
  request: {method: string; path: string; body: string},
  write: (tx: AppDatabase) => Promise<ApiResult>,
): Promise<ApiResult> {
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
        and(
          eq(idempotencyKeys.workspaceId, workspaceId),
          lt(
            idempotencyKeys.createdAt,
            sql`now() - make_interval(hours => ${IDEMPOTENCY_KEY_TTL_HOURS})`,
          ),
        ),
      );

    const claimed = await tx
      .insert(idempotencyKeys)
      .values({workspaceId, key, requestHash, statusCode: 0, responseBody: {}})
      .onConflictDoNothing()
      .returning({key: idempotencyKeys.key});

    if (claimed.length === 0) {
      return replay(tx, workspaceId, key, requestHash);
    }

    const result = await write(tx);
    // Store exactly what the client receives (dates as ISO strings).
    const body = JSON.parse(JSON.stringify(result.body));
    await tx
      .update(idempotencyKeys)
      .set({statusCode: result.status, responseBody: body})
      .where(and(eq(idempotencyKeys.workspaceId, workspaceId), eq(idempotencyKeys.key, key)));
    return {status: result.status, body};
  });
}

async function replay(
  db: AppDatabase,
  workspaceId: string,
  key: string,
  requestHash: string,
): Promise<ApiResult> {
  const [stored] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.workspaceId, workspaceId), eq(idempotencyKeys.key, key)));
  if (stored.requestHash !== requestHash) {
    throw new IdempotencyConflictError(
      'This Idempotency-Key was already used for a different request',
    );
  }
  return {status: stored.statusCode, body: stored.responseBody};
}

function hashRequest(request: {method: string; path: string; body: string}): string {
  return sha256Hex(`${request.method}\n${request.path}\n${request.body}`);
}
