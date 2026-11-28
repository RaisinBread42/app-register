import {randomBytes} from 'node:crypto';
import {and, asc, desc, eq, isNull} from 'drizzle-orm';
import {
  API_KEY_NAME_MAX_LENGTH,
  API_KEY_PREFIX,
  API_KEY_SCOPE_LABEL,
  API_KEY_STATUS,
  APPLICATIONS_REGISTER_SCOPES,
  type ApiKeyScope,
  type ApiKeyStatus,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {apiKeyScopes, apiKeys} from '@/lib/db/schema';
import {sha256Hex} from '@/lib/hash';
import {NotFoundError, ValidationError} from './errors';
import {atMost, optionalDate, requiredText} from './validation';

/** Characters of the key kept in plain text to tell keys apart (prefix + 6). */
const VISIBLE_KEY_LENGTH = API_KEY_PREFIX.length + 6;

export type CreatedApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  key: string;
  expiresAt: string | null;
  scopes: ApiKeyScope[];
  scopeLabel: string;
};

export type ListedApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopeLabel: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  status: ApiKeyStatus;
  revokedAt: string | null;
};

export type ApiKeyAuth = {
  workspaceId: string;
  /** The key's name, recorded as who did what until people sign in ([37]). */
  keyName: string;
  /** `null` = unrestricted (no scope rows). Otherwise the key's scopes. */
  scopes: readonly ApiKeyScope[] | null;
};

export type CreateApiKeyOptions = {
  /** Calendar date YYYY-MM-DD; null/omitted = no expiry. End of that UTC day. */
  expiresOn?: string | null;
  /** Empty/omitted = unrestricted. Settings passes APPLICATIONS_REGISTER_SCOPES. */
  scopes?: readonly ApiKeyScope[];
};

/** Creates a key for a workspace. The returned `key` is the only copy: store it now. */
export async function createApiKey(
  db: AppDatabase,
  workspaceId: string,
  name: string,
  options: CreateApiKeyOptions = {},
): Promise<CreatedApiKey> {
  const trimmed = atMost(requiredText(name, 'API key name'), API_KEY_NAME_MAX_LENGTH, 'API key name');
  const expiresAt = expiryFromDate(options.expiresOn);
  const scopes = [...(options.scopes ?? [])];
  assertKnownScopes(scopes);
  const key = API_KEY_PREFIX + randomBytes(32).toString('base64url');
  const row = {
    id: newId(),
    workspaceId,
    name: trimmed,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, VISIBLE_KEY_LENGTH),
    expiresAt,
  };
  // One transaction: a failed scope insert must not leave an unrestricted key.
  await db.transaction(async (tx) => {
    await tx.insert(apiKeys).values(row);
    if (scopes.length > 0) {
      await tx.insert(apiKeyScopes).values(
        scopes.map((scope) => ({apiKeyId: row.id, workspaceId, scope})),
      );
    }
  });
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    key,
    expiresAt: toIso(expiresAt),
    scopes,
    scopeLabel: scopeLabelFor(scopes),
  };
}

/** Keys in a workspace, newest first. Never includes the secret. */
export async function listApiKeys(db: AppDatabase, workspaceId: string): Promise<ListedApiKey[]> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, workspaceId))
    .orderBy(desc(apiKeys.createdAt), asc(apiKeys.name));
  const scopeRows = await db
    .select()
    .from(apiKeyScopes)
    .where(eq(apiKeyScopes.workspaceId, workspaceId));
  const scopesByKey = new Map<string, ApiKeyScope[]>();
  for (const row of scopeRows) {
    const list = scopesByKey.get(row.apiKeyId) ?? [];
    list.push(row.scope);
    scopesByKey.set(row.apiKeyId, list);
  }
  const now = new Date();
  return rows.map((row) => {
    const scopes = scopesByKey.get(row.id) ?? [];
    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes,
      scopeLabel: scopeLabelFor(scopes),
      createdAt: row.createdAt.toISOString(),
      expiresAt: toIso(row.expiresAt),
      lastUsedAt: toIso(row.lastUsedAt),
      status: statusOf(row, now),
      revokedAt: toIso(row.revokedAt),
    };
  });
}

/**
 * The workspace a key belongs to and its scopes, or null when unknown, revoked
 * or expired. Records last-used when the key is accepted.
 */
export async function authenticateApiKey(db: AppDatabase, key: string): Promise<ApiKeyAuth | null> {
  if (!key.startsWith(API_KEY_PREFIX)) {
    return null;
  }
  const [row] = await db
    .select({
      id: apiKeys.id,
      workspaceId: apiKeys.workspaceId,
      name: apiKeys.name,
      revokedAt: apiKeys.revokedAt,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(key)));
  if (!row || row.revokedAt) {
    return null;
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  await db.update(apiKeys).set({lastUsedAt: new Date()}).where(eq(apiKeys.id, row.id));
  const scopes = await db
    .select({scope: apiKeyScopes.scope})
    .from(apiKeyScopes)
    .where(and(eq(apiKeyScopes.apiKeyId, row.id), eq(apiKeyScopes.workspaceId, row.workspaceId)));
  return {
    workspaceId: row.workspaceId,
    keyName: row.name,
    scopes: scopes.length === 0 ? null : scopes.map((s) => s.scope),
  };
}

/** The workspace a key belongs to, or null when the key is unknown, revoked or expired. */
export async function findWorkspaceForApiKey(
  db: AppDatabase,
  key: string,
): Promise<string | null> {
  const auth = await authenticateApiKey(db, key);
  return auth?.workspaceId ?? null;
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

/** End of the given UTC calendar day, or null when there is no expiry. Past dates are refused. */
export function expiryFromDate(expiresOn: unknown): Date | null {
  const day = optionalDate(expiresOn, 'expiry date');
  if (!day) {
    return null;
  }
  const expiresAt = new Date(`${day}T23:59:59.999Z`);
  if (expiresAt.getTime() <= Date.now()) {
    throw new ValidationError('Expiry date must be today or in the future');
  }
  return expiresAt;
}

function statusOf(
  row: {revokedAt: Date | null; expiresAt: Date | null},
  now: Date,
): ApiKeyStatus {
  if (row.revokedAt) {
    return API_KEY_STATUS.revoked;
  }
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
    return API_KEY_STATUS.expired;
  }
  return API_KEY_STATUS.active;
}

function scopeLabelFor(scopes: readonly ApiKeyScope[]): string {
  if (scopes.length === 0) {
    return API_KEY_SCOPE_LABEL.fullAccess;
  }
  const wanted = new Set(APPLICATIONS_REGISTER_SCOPES);
  if (scopes.length === wanted.size && scopes.every((scope) => wanted.has(scope))) {
    return API_KEY_SCOPE_LABEL.applicationsRegister;
  }
  return scopes.slice().sort().join(', ');
}

function assertKnownScopes(scopes: readonly ApiKeyScope[]): void {
  const allowed = new Set<string>(APPLICATIONS_REGISTER_SCOPES);
  for (const scope of scopes) {
    if (!allowed.has(scope)) {
      throw new ValidationError(`Unknown API key scope: ${scope}`);
    }
  }
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
