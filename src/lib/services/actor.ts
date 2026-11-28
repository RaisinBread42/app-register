import {ACTOR_SYSTEM_NAME} from '@/lib/constants';

/** Who did something, for the audit trail: a name to show and, for an API key, its id (names are not unique). */
export type Actor = {name: string; keyId: string | null};

/** Scheduled jobs and checks. */
export const SYSTEM_ACTOR: Actor = {name: ACTOR_SYSTEM_NAME, keyId: null};

/** An API key, until people sign in ([37]); the UI acts through its own key. */
export function apiKeyActor(keyName: string, keyId: string): Actor {
  return {name: `API key "${keyName}"`, keyId};
}
