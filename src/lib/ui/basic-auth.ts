import {createHash, timingSafeEqual} from 'node:crypto';
import {API_PATH_PREFIX, BASIC_AUTH_VERDICT, BASIC_PREFIX, type BasicAuthVerdict} from '@/lib/constants';

/**
 * Shared-password HTTP Basic auth for the UI, until real sign-in exists.
 * Any username is accepted; only the password is checked.
 */

/** `/api` and `/api/*` keep their own bearer auth; `/apifoo` is a UI path like any other. */
export function isApiPath(pathname: string): boolean {
  return pathname === API_PATH_PREFIX || pathname.startsWith(`${API_PATH_PREFIX}/`);
}

/** Checks an `Authorization: Basic …` header. No password configured means nobody gets in. */
export function checkBasicAuth(header: string | null, password: string | undefined): BasicAuthVerdict {
  if (!password) {
    return BASIC_AUTH_VERDICT.notConfigured;
  }
  const sent = passwordFrom(header);
  if (sent === null) {
    return BASIC_AUTH_VERDICT.refuse;
  }
  return sameSecret(sent, password) ? BASIC_AUTH_VERDICT.allow : BASIC_AUTH_VERDICT.refuse;
}

function passwordFrom(header: string | null): string | null {
  if (!header || !header.startsWith(BASIC_PREFIX)) {
    return null;
  }
  const decoded = Buffer.from(header.slice(BASIC_PREFIX.length).trim(), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  return colon === -1 ? null : decoded.slice(colon + 1);
}

/** Constant-time compare: hashing first makes both sides the same length. */
function sameSecret(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
