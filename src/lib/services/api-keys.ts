import {randomBytes} from 'node:crypto';
import {and, eq, isNull} from 'drizzle-orm';
import {API_KEY_PREFIX} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {newId} from '@/lib/db/ids';
import {apiKeys} from '@/lib/db/schema';
import {sha256Hex} from '@/lib/hash';
import {NotFoundError, ValidationError} from './errors';

/** Characters of the key kept in plain text to tell keys apart (prefix + 6). */
const VISIBLE_KEY_LENGTH = API_KEY_PREFIX.length + 6;

export type CreatedApiKey = {id: string; name: string; keyPrefix: string; key: string};

/** Creates a key for a workspace. The returned `key` is the only copy: store it now. */
export async function createApiKey(
  db: AppDatabase,
  workspaceId: string,
  name: string,
): Promise<CreatedApiKey> {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) {
    throw new ValidationError('API key name is required');
  }
  const key = API_KEY_PREFIX + randomBytes(32).toString('base64url');
  const row = {
    id: newId(),
    workspaceId,
    name: trimmed,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, VISIBLE_KEY_LENGTH),
  };
  await db.insert(apiKeys).values(row);
  return {id: row.id, name: row.name, keyPrefix: row.keyPrefix, key};
}

/** The workspace a key belongs to, or null when the key is unknown or revoked. */
export async function findWorkspaceForApiKey(
  db: AppDatabase,
  key: string,
): Promise<string | null> {
  if (!key.startsWith(API_KEY_PREFIX)) {
    return null;
  }
  const [row] = await db
    .select({workspaceId: apiKeys.workspaceId})
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.revokedAt)));
  return row?.workspaceId ?? null;
}

export async function revokeApiKey(
  db: AppDatabase,
  workspaceId: string,
  keyPrefix: string,
): Promise<void> {
  const revoked = await db
    .update(apiKeys)
    .set({revokedAt: new Date()})
    .where(
      and(
        eq(apiKeys.workspaceId, workspaceId),
        eq(apiKeys.keyPrefix, keyPrefix),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({id: apiKeys.id});
  if (revoked.length === 0) {
    throw new NotFoundError('No active API key with that prefix');
  }
}

/** Keys are 256 random bits, so a fast hash is enough (no password-style stretching). */
export function hashApiKey(key: string): string {
  return sha256Hex(key);
}
