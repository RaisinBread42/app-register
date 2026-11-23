import {readBytesUpTo} from '@/lib/capped-body';
import {API_HEADER, HOSTING_FEED_MAX_RESPONSE_BYTES, MONITORING_TIMEOUT_MS, MONITORING_USER_AGENT} from '@/lib/constants';
import type {Fetch} from '@/lib/services/package-sources';

/**
 * The one place the hosting check calls outside feeds. Polite by default: a
 * short timeout and a User-Agent that names the product and nothing else.
 * An answer longer than HOSTING_FEED_MAX_RESPONSE_BYTES is not read to the end
 * and counts as no answer, and a redirect is never followed. Tests pass a fake:
 * `src/test-setup.ts` blocks `fetch`.
 */

/** The body of `url` as text. Stops early when `signal` aborts (the caller ran out of time). */
export type FetchText = (url: string, signal?: AbortSignal) => Promise<string>;

const UTF16_BE_BOM = [0xfe, 0xff];
const UTF16_LE_BOM = [0xff, 0xfe];

export function createFetchText(send: Fetch = fetch): FetchText {
  return async (url, signal) => {
    const timeout = AbortSignal.timeout(MONITORING_TIMEOUT_MS);
    const response = await send(url, {
      headers: {[API_HEADER.userAgent]: MONITORING_USER_AGENT},
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: 'no-store',
      // A feed is only ever read from its own fixed URL: a redirect counts as a failed source.
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const bytes = await readBytesUpTo(response, HOSTING_FEED_MAX_RESPONSE_BYTES);
    if (bytes === null) {
      throw new Error('answer over the size cap');
    }
    return decode(bytes);
  };
}

/** AWS serves its health JSON as UTF-16; everything else is UTF-8. The byte order mark tells them apart. */
export function decode(bytes: Uint8Array): string {
  const startsWith = (bom: number[]) => bom.every((byte, i) => bytes[i] === byte);
  const encoding = startsWith(UTF16_BE_BOM) ? 'utf-16be' : startsWith(UTF16_LE_BOM) ? 'utf-16le' : 'utf-8';
  return new TextDecoder(encoding).decode(bytes);
}
