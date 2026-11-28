import {PG_ERROR_CODE} from '@/lib/constants';

/** Bad input from the caller: the API answers 400 with the message. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Unknown id, or an id from another workspace: the API answers 404. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** An Idempotency-Key reused for a different request: the API answers 422. */
export class IdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

/** No valid bearer API key: the API answers 401. */
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** A scoped API key lacks permission for this route: the API answers 403. */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return errorCode(error) === PG_ERROR_CODE.uniqueViolation;
}

/** postgres.js and PGlite put the SQLSTATE on `code`; Drizzle may wrap it in `cause`. */
function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const {code, cause} = error as {code?: unknown; cause?: unknown};
  return typeof code === 'string' ? code : errorCode(cause);
}
