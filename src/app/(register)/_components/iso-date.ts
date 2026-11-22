import type {ISODateString} from '@astryxdesign/core/Calendar';

/** A form's date text as DateInput takes it: blank means no date. Dates from the API are already YYYY-MM-DD. */
export function isoDate(value: string): ISODateString | undefined {
  return value ? (value as ISODateString) : undefined;
}
