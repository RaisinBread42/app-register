import {createHash} from 'node:crypto';

/** SHA-256 of a string, as 64 lowercase hex characters. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
