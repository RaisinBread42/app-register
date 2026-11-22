import {MONITOR_TIMEOUT_MS, MONITOR_USER_AGENT} from '@/lib/constants';

/**
 * The one place the app calls outside feeds. Polite by default: a short
 * timeout and a User-Agent that names the product and nothing else.
 * Tests never reach the network: `src/test-setup.ts` replaces `fetchText`.
 */

export type FetchText = (url: string) => Promise<string>;

const UTF16_BE_BOM = [0xfe, 0xff];
const UTF16_LE_BOM = [0xff, 0xfe];

export const fetchText: FetchText = async (url) => {
  const response = await fetch(url, {
    headers: {'user-agent': MONITOR_USER_AGENT},
    signal: AbortSignal.timeout(MONITOR_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return decode(new Uint8Array(await response.arrayBuffer()));
};

/** AWS serves its health JSON as UTF-16; everything else is UTF-8. The byte order mark tells them apart. */
export function decode(bytes: Uint8Array): string {
  const startsWith = (bom: number[]) => bom.every((byte, i) => bytes[i] === byte);
  const encoding = startsWith(UTF16_BE_BOM) ? 'utf-16be' : startsWith(UTF16_LE_BOM) ? 'utf-16le' : 'utf-8';
  return new TextDecoder(encoding).decode(bytes);
}
