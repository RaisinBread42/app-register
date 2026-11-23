import {VERSION_LAG, type VersionLag} from '@/lib/constants';

/** Plain reading of npm version strings. No ranges are resolved: that is the lockfile's job. */

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const RANGE_OPERATORS = /^[\s^~<>=v]+/;
/** `16.4.6` → 16 and 4; `16` or `16.x` → 16 and no minor. */
const MAJOR_MINOR = /^(\d+)(?:\.(\d+))?/;

/** True for a full version such as `16.4.6` or `1.0.0-rc.1`: the only kind advisories can be matched to. */
export function isExactVersion(version: string): boolean {
  return EXACT_VERSION.test(version);
}

/** `^16.4.6` → `16.4.6`, `>=1.2.0 <2` → `1.2.0`, `~4.1` → `4.1`. Tags and URLs (`latest`, `github:…`) come back unchanged. */
export function stripRange(range: string): string {
  const [first] = range.trim().replace(RANGE_OPERATORS, '').split(/\s+/);
  return /^\d/.test(first) ? first : range.trim();
}

/**
 * How far `current` is behind `latest`: a major version, a minor version, or
 * neither (also when either cannot be read). A version with no minor part
 * (`16`, `4.x`) can only be a major version behind.
 */
export function versionLag(current: string, latest: string | null): VersionLag | null {
  const from = MAJOR_MINOR.exec(current);
  const to = MAJOR_MINOR.exec(latest ?? '');
  if (!from || !to) {
    return null;
  }
  const [fromMajor, toMajor] = [Number(from[1]), Number(to[1])];
  if (toMajor > fromMajor) {
    return VERSION_LAG.major;
  }
  const isMinorBehind = from[2] !== undefined && to[2] !== undefined && Number(to[2]) > Number(from[2]);
  return toMajor === fromMajor && isMinorBehind ? VERSION_LAG.minor : null;
}
