import {HTTP_STATUS} from '@/lib/constants';
import {ApiError} from './api-client';

/** What every server action hands back to its form: done, or a message to show next to it. */
export type ActionResult = {ok: true} | {ok: false; error: string};

export const ACTION_MESSAGE = {
  idempotencyConflict:
    'This save was already used for different values. Reload the page and try again.',
  notFound: 'This record no longer exists. It may have been removed or archived.',
  unexpected: 'Something went wrong while saving. Please try again.',
} as const;

/** Runs one API call for a form and turns API errors into a message the user can act on. */
export async function runAction(call: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await call();
    return {ok: true};
  } catch (error) {
    return {ok: false, error: messageFor(error)};
  }
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) {
    console.error('UI action failed', {name: (error as Error | undefined)?.name});
    return ACTION_MESSAGE.unexpected;
  }
  if (error.status === HTTP_STATUS.badRequest) {
    return error.message;
  }
  if (error.status === HTTP_STATUS.unprocessable) {
    return ACTION_MESSAGE.idempotencyConflict;
  }
  if (error.status === HTTP_STATUS.notFound) {
    return ACTION_MESSAGE.notFound;
  }
  console.error('UI action failed', {status: error.status});
  return ACTION_MESSAGE.unexpected;
}
