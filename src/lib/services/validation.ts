import {isIsoDateOnly} from '@/lib/notice-alerts';
import {ValidationError} from './errors';

/** Optional text from a JSON body: trimmed, empty becomes null, non-strings are a 400. */
export function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  // Postgres text cannot hold a NUL character; refuse it here rather than fail in the DB.
  if (typeof value !== 'string' || value.includes('\u0000')) {
    throw new ValidationError(`Invalid ${label}`);
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function requiredText(value: unknown, label: string): string {
  const text = optionalText(value, label);
  if (!text) {
    throw new ValidationError(`${label[0].toUpperCase()}${label.slice(1)} is required`);
  }
  return text;
}

/** The text, or a 400 when it is longer than `max` characters. */
export function atMost(text: string, max: number, label: string): string {
  if (text.length > max) {
    throw new ValidationError(`${label[0].toUpperCase()}${label.slice(1)} is longer than ${max} characters`);
  }
  return text;
}

/** Optional calendar date as YYYY-MM-DD. */
export function optionalDate(value: unknown, label: string): string | null {
  const text = optionalText(value, label);
  if (text && !isIsoDateOnly(text)) {
    throw new ValidationError(`Invalid ${label}: ${text}`);
  }
  return text;
}

/** True for a JSON object: not null, not a list. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
