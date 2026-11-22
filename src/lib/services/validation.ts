import {isIsoDateOnly} from '@/lib/notice-alerts';
import {ValidationError} from './errors';

/** Optional text from a JSON body: trimmed, empty becomes null, non-strings are a 400. */
export function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
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

/** Optional calendar date as YYYY-MM-DD. */
export function optionalDate(value: unknown, label: string): string | null {
  const text = optionalText(value, label);
  if (text && !isIsoDateOnly(text)) {
    throw new ValidationError(`Invalid ${label}: ${text}`);
  }
  return text;
}
