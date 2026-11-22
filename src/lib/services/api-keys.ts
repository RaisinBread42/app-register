import {randomBytes} from 'node:crypto';
import {and, eq, isNull} from 'drizzle-orm';
import {API_KEY_PREFIX} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {apiKeys} from '@/lib/db/schema';
import {sha256Hex} from '@/lib/hash';
import {NotFoundError, ValidationError} from './errors';
import {requiredText} from './validation';

/** Characters of the key kept in plain text to tell keys apart (prefix + 6). */
const VISIBLE_KEY_LENGTH = API_KEY_PREFIX.length + 6;

export type CreatedApiKey = {id: string; name: string; keyPrefix: string; key: string};

/** Creates a key for a workspace. The returned `key` is the only copy: store it now. */
export async function createApiKey(
  db: AppDatabase,
  workspaceId: string,
  name: string,
): Promise<CreatedApiKey> {
  const trimmed = requiredText(name, 'API key name');
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

/** Revokes one active key, named by the prefix printed at creation or by its id. */
export async function revokeApiKey(
  db: AppDatabase,
  workspaceId: string,
  prefixOrId: string,
): Promise<void> {
  const active = and(
    eq(apiKeys.workspaceId, workspaceId),
    isUuid(prefixOrId) ? eq(apiKeys.id, prefixOrId) : eq(apiKeys.keyPrefix, prefixOrId),
    isNull(apiKeys.revokedAt),
  );
  const matches = await db.select({id: apiKeys.id}).from(apiKeys).where(active);
  if (matches.length === 0) {
    throw new NotFoundError('No active API key with that prefix or id');
  }
  // Prefixes are short, so two keys can share one: never revoke more than the one meant.
  if (matches.length > 1) {
    throw new ValidationError('More than one active key has that prefix; revoke by id (api_keys.id)');
  }
  await db.update(apiKeys).set({revokedAt: new Date()}).where(eq(apiKeys.id, matches[0].id));
}

/** Keys are 256 random bits, so a fast hash is enough (no password-style stretching). */
export function hashApiKey(key: string): string {
  return sha256Hex(key);
}
