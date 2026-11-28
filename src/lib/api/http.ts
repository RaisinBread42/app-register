import {readTextUpTo} from '@/lib/capped-body';
import {
  API_HEADER,
  BYTES_PER_MB,
  HTTP_STATUS,
  IDEMPOTENT_METHODS,
  type ApiKeyScope,
} from '@/lib/constants';
import {getDb, type AppDatabase} from '@/lib/db/client';
import {authenticateApiKey} from '@/lib/services/api-keys';
import {
  ForbiddenError,
  IdempotencyConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/services/errors';
import {runOnce, type ApiResult, type WrittenResource} from '@/lib/services/idempotency';
import {replayBody} from './replay';

const BEARER_TOKEN = /^bearer\s+(\S+)$/i;

export type ApiContext = {
  db: AppDatabase;
  workspaceId: string;
  body: string;
  /** `null` = unrestricted key. Otherwise the key may only call routes that require one of these. */
  scopes: readonly ApiKeyScope[] | null;
  /** Who is acting, for the audit trail: the API key by name until people sign in ([37]). */
  actor: string;
};

/** `resource`: what a POST or PATCH answered about, so a repeat with the same Idempotency-Key can read it again. */
export function ok(body: unknown, resource?: WrittenResource): ApiResult {
  return {status: HTTP_STATUS.ok, body, resource};
}

export function created(body: unknown, resource?: WrittenResource): ApiResult {
  return {status: HTTP_STATUS.created, body, resource};
}

export function noContent(): ApiResult {
  return {status: HTTP_STATUS.noContent, body: null};
}

export type HandleOptions = {
  /**
   * A POST that is safe to repeat (a re-check, not a write of the caller's data):
   * it needs no Idempotency-Key and does not run inside a write transaction.
   */
  isSafeToRepeat?: boolean;
  /** Largest request body accepted, in bytes; a longer one is a 400 and is not read to the end. */
  maxBodyBytes?: number;
  /**
   * Slow follow-up work (outside calls) for a successful write. It runs after the
   * write has committed, never inside its transaction, and before the response is
   * sent. If it fails the write still stands; the failure is logged by name only.
   * It does not run again when a request is repeated with the same Idempotency-Key.
   */
  afterCommit?: (context: Omit<ApiContext, 'body'>, result: ApiResult) => Promise<unknown>;
  /**
   * Scope a restricted API key needs for this route. Unrestricted keys (no scope
   * rows) always pass. Restricted keys without this scope get 403. Omit for
   * routes that only unrestricted keys may call (people, alerts, key management).
   */
  requiredScope?: ApiKeyScope;
};

/**
 * Every API route goes through here:
 * 1. a bearer API key picks the workspace (401 without one);
 * 2. a restricted key without the route's scope is refused with 403;
 * 3. POST and PATCH run at most once per Idempotency-Key; a repeat answers with the
 *    first status and the resource as it is now (`replayBody`);
 * 4. service errors become `{ error }` responses.
 */
export async function handle(
  request: Request,
  run: (context: ApiContext) => Promise<ApiResult>,
  options: HandleOptions = {},
): Promise<Response> {
  try {
    const db = getDb();
    const auth = await authenticate(db, request);
    assertScope(auth.scopes, options.requiredScope);
    const body = await readBody(request, options.maxBodyBytes);
    const actor = actorFor(auth.keyName);
    const context: ApiContext = {db, workspaceId: auth.workspaceId, body, scopes: auth.scopes, actor};
    const isWrite = (IDEMPOTENT_METHODS as readonly string[]).includes(request.method);
    if (!isWrite || options.isSafeToRepeat) {
      return toResponse(await run(context));
    }
    const url = new URL(request.url);
    const once = await runOnce(
      db,
      auth.workspaceId,
      request.headers.get(API_HEADER.idempotencyKey),
      {method: request.method, path: url.pathname + url.search, body},
      (tx) => run({db: tx, workspaceId: auth.workspaceId, body, scopes: auth.scopes, actor}),
    );
    if (once.isReplay) {
      return toResponse({status: once.status, body: await replayBody(db, auth.workspaceId, once.resource)});
    }
    if (options.afterCommit) {
      await options.afterCommit(
        {db, workspaceId: auth.workspaceId, scopes: auth.scopes, actor},
        once.result,
      ).catch((error: unknown) => {
        console.error('API follow-up failed', {name: (error as Error | undefined)?.name});
      });
    }
    return toResponse(once.result);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Refuses a restricted key that lacks `requiredScope`. Unrestricted keys always pass. */
export function assertScope(
  scopes: readonly ApiKeyScope[] | null,
  requiredScope: ApiKeyScope | undefined,
): void {
  if (scopes === null) {
    return;
  }
  if (!requiredScope || !scopes.includes(requiredScope)) {
    throw new ForbiddenError('This API key does not allow that action');
  }
}

/** The request body as a plain JSON object, or a 400. */
export function jsonObject<T>(body: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ValidationError('Request body must be JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  return parsed as T;
}

/** The body as text. With a cap, an oversized body is refused from its Content-Length or as soon as too much has arrived. */
async function readBody(request: Request, maxBytes?: number): Promise<string> {
  if (maxBytes === undefined) {
    return request.text();
  }
  const isDeclaredTooLarge = Number(request.headers.get(API_HEADER.contentLength)) > maxBytes;
  const body = isDeclaredTooLarge ? null : await readTextUpTo(request, maxBytes);
  if (body === null) {
    throw new ValidationError(`The request body is larger than ${maxBytes / BYTES_PER_MB} MB`);
  }
  return body;
}

/** How an API key appears in the audit trail. */
export function actorFor(keyName: string): string {
  return `API key "${keyName}"`;
}

async function authenticate(
  db: AppDatabase,
  request: Request,
): Promise<{workspaceId: string; keyName: string; scopes: readonly ApiKeyScope[] | null}> {
  const match = BEARER_TOKEN.exec(request.headers.get(API_HEADER.authorization) ?? '');
  if (!match) {
    throw new UnauthorizedError('Send an API key as: Authorization: Bearer <key>');
  }
  const auth = await authenticateApiKey(db, match[1]);
  if (!auth) {
    throw new UnauthorizedError('Invalid, revoked or expired API key');
  }
  return auth;
}

function toResponse(result: ApiResult): Response {
  if (result.status === HTTP_STATUS.noContent) {
    return new Response(null, {status: result.status});
  }
  return Response.json(result.body, {status: result.status});
}

/**
 * Maps service errors to `{ error }` responses. Unexpected errors are logged by
 * name and code only: database messages can quote the row, including emails.
 */
function errorResponse(error: unknown): Response {
  if (error instanceof ValidationError) {
    return Response.json({error: error.message}, {status: HTTP_STATUS.badRequest});
  }
  if (error instanceof UnauthorizedError) {
    return Response.json(
      {error: error.message},
      {status: HTTP_STATUS.unauthorized, headers: {[API_HEADER.wwwAuthenticate]: 'Bearer'}},
    );
  }
  if (error instanceof ForbiddenError) {
    return Response.json({error: error.message}, {status: HTTP_STATUS.forbidden});
  }
  if (error instanceof NotFoundError) {
    return Response.json({error: error.message}, {status: HTTP_STATUS.notFound});
  }
  if (error instanceof IdempotencyConflictError) {
    return Response.json({error: error.message}, {status: HTTP_STATUS.unprocessable});
  }
  const {name, code} = (error ?? {}) as {name?: string; code?: string};
  console.error('API request failed', {name, code});
  return Response.json({error: 'Internal error'}, {status: HTTP_STATUS.serverError});
}
