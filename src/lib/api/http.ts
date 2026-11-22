import {NotFoundError, ValidationError} from '@/lib/services/errors';

const HTTP_STATUS = {
  created: 201,
  badRequest: 400,
  notFound: 404,
  serverError: 500,
} as const;

export function ok(body: unknown): Response {
  return Response.json(body);
}

export function created(body: unknown): Response {
  return Response.json(body, {status: HTTP_STATUS.created});
}

/** The request body as a plain object, or a 400. */
export async function readJsonObject<T>(request: Request): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Request body must be JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  return body as T;
}

/**
 * Maps service errors to `{ error }` responses. Unexpected errors are logged by
 * name and code only: database messages can quote the row, including emails.
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof ValidationError) {
    return Response.json({error: error.message}, {status: HTTP_STATUS.badRequest});
  }
  if (error instanceof NotFoundError) {
    return Response.json({error: error.message}, {status: HTTP_STATUS.notFound});
  }
  const {name, code} = (error ?? {}) as {name?: string; code?: string};
  console.error('API request failed', {name, code});
  return Response.json({error: 'Internal error'}, {status: HTTP_STATUS.serverError});
}
