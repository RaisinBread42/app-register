import {API_HEADER, HTTP_STATUS, IDEMPOTENT_METHODS} from '@/lib/constants';
import {getDb, type AppDatabase} from '@/lib/db/client';
import {findWorkspaceForApiKey} from '@/lib/services/api-keys';
import {
  IdempotencyConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/services/errors';
import {runOnce, type ApiResult} from '@/lib/services/idempotency';

const BEARER_TOKEN = /^bearer\s+(\S+)$/i;

export type ApiContext = {db: AppDatabase; workspaceId: string; body: string};

export function ok(body: unknown): ApiResult {
  return {status: HTTP_STATUS.ok, body};
}

export function created(body: unknown): ApiResult {
  return {status: HTTP_STATUS.created, body};
}

export function noContent(): ApiResult {
  return {status: HTTP_STATUS.noContent, body: null};
}

/**
 * Every API route goes through here:
 * 1. a bearer API key picks the workspace (401 without one);
 * 2. POST and PATCH run at most once per Idempotency-Key;
 * 3. service errors become `{ error }` responses.
 */
export async function handle(
  request: Request,
  run: (context: ApiContext) => Promise<ApiResult>,
): Promise<Response> {
  try {
    const db = getDb();
    const workspaceId = await authenticate(db, request);
    const body = await request.text();
    if (!(IDEMPOTENT_METHODS as readonly string[]).includes(request.method)) {
      return toResponse(await run({db, workspaceId, body}));
    }
    const url = new URL(request.url);
    const result = await runOnce(
      db,
      workspaceId,
      request.headers.get(API_HEADER.idempotencyKey),
      {method: request.method, path: url.pathname + url.search, body},
      (tx) => run({db: tx, workspaceId, body}),
    );
    return toResponse(result);
  } catch (error) {
    return errorResponse(error);
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

async function authenticate(db: AppDatabase, request: Request): Promise<string> {
  const match = BEARER_TOKEN.exec(request.headers.get(API_HEADER.authorization) ?? '');
  if (!match) {
    throw new UnauthorizedError('Send an API key as: Authorization: Bearer <key>');
  }
  const workspaceId = await findWorkspaceForApiKey(db, match[1]);
  if (!workspaceId) {
    throw new UnauthorizedError('Invalid or revoked API key');
  }
  return workspaceId;
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
