import {
  ADVISORY_SEVERITY,
  API_HEADER,
  HTTP_METHOD,
  HTTP_STATUS,
  JSON_CONTENT_TYPE,
  MONITORING_CONCURRENCY,
  MONITORING_TIMEOUT_MS,
  MONITORING_USER_AGENT,
  NPM_REGISTRY_URL,
  OSV_ADVISORY_PAGE_URL,
  OSV_API_URL,
  OSV_BATCH_SIZE,
  OSV_ECOSYSTEM_NPM,
  type AdvisorySeverity,
} from '@/lib/constants';
import type {StoredAdvisory} from '@/lib/db/schema';

/**
 * The only module that talks to the outside world for dependency monitoring.
 * Two free, keyless sources:
 * - npm registry: `GET {registry}/{name}/latest` → `{ version }` (404 when unknown);
 * - OSV.dev: `POST /v1/querybatch` → advisory ids per package@version, then
 *   `GET /v1/vulns/{id}` → summary, aliases and severity.
 * Only package names and versions leave the server. Tests pass a fake `fetch`.
 */

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type PackageVersion = {name: string; version: string};

export type PackageSources = {
  /** The latest published version, or null when the registry does not know the package. Throws when it cannot be reached. */
  latestVersion(name: string): Promise<string | null>;
  /** Known advisories for each package@version, in the order given. Throws when the source cannot be reached. */
  advisories(packages: PackageVersion[]): Promise<StoredAdvisory[][]>;
};

/** npm's own rule for package names (older packages may use capitals). Anything else is never sent anywhere. */
const NPM_NAME = /^(@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i;
const NPM_NAME_MAX_LENGTH = 214;

export function isNpmPackageName(name: string): boolean {
  return name.length <= NPM_NAME_MAX_LENGTH && NPM_NAME.test(name);
}

/** OSV ids for packages published as malware carry no severity; they are always critical. */
const MALWARE_ID_PREFIX = 'MAL-';

/** Severity words GitHub's advisory database uses, as OSV passes them on. */
const SEVERITY_BY_LABEL: Record<string, AdvisorySeverity> = {
  CRITICAL: ADVISORY_SEVERITY.critical,
  HIGH: ADVISORY_SEVERITY.high,
  MODERATE: ADVISORY_SEVERITY.medium,
  MEDIUM: ADVISORY_SEVERITY.medium,
  LOW: ADVISORY_SEVERITY.low,
};

type OsvBatchResponse = {results?: {vulns?: {id: string}[]}[]};
type OsvVulnerability = {
  id: string;
  summary?: string;
  aliases?: string[];
  withdrawn?: string;
  database_specific?: {severity?: string};
};

export function createPackageSources(send: Fetch = fetch): PackageSources {
  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    return send(url, {
      ...init,
      headers: {...init.headers, [API_HEADER.userAgent]: MONITORING_USER_AGENT},
      signal: AbortSignal.timeout(MONITORING_TIMEOUT_MS),
      cache: 'no-store',
    });
  }

  async function json<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(`Monitoring source answered ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async function advisory(id: string): Promise<StoredAdvisory | null> {
    const found = await json<OsvVulnerability>(await request(`${OSV_API_URL}/vulns/${encodeURIComponent(id)}`));
    if (found.withdrawn) {
      return null;
    }
    return {
      id: found.id,
      aliases: found.aliases ?? [],
      severity: severityOf(found),
      summary: found.summary ?? '',
      url: `${OSV_ADVISORY_PAGE_URL}/${encodeURIComponent(found.id)}`,
    };
  }

  async function advisoryIds(packages: PackageVersion[]): Promise<string[][]> {
    const response = await request(`${OSV_API_URL}/querybatch`, {
      method: HTTP_METHOD.post,
      headers: {[API_HEADER.contentType]: JSON_CONTENT_TYPE},
      body: JSON.stringify({
        queries: packages.map(({name, version}) => ({package: {name, ecosystem: OSV_ECOSYSTEM_NPM}, version})),
      }),
    });
    const {results = []} = await json<OsvBatchResponse>(response);
    return packages.map((_, index) => (results[index]?.vulns ?? []).map((vuln) => vuln.id));
  }

  return {
    async latestVersion(name) {
      // A scoped name keeps its "@" and has its "/" encoded: @types%2Fnode.
      const response = await request(`${NPM_REGISTRY_URL}/${encodeURIComponent(name).replace('%40', '@')}/latest`);
      if (response.status === HTTP_STATUS.notFound) {
        return null;
      }
      const {version} = await json<{version?: unknown}>(response);
      return typeof version === 'string' ? version : null;
    },

    async advisories(packages) {
      const idsPerPackage: string[][] = [];
      for (let start = 0; start < packages.length; start += OSV_BATCH_SIZE) {
        idsPerPackage.push(...(await advisoryIds(packages.slice(start, start + OSV_BATCH_SIZE))));
      }
      const uniqueIds = [...new Set(idsPerPackage.flat())];
      const details = new Map<string, StoredAdvisory | null>();
      await mapWithLimit(uniqueIds, async (id) => {
        details.set(id, await advisory(id));
      });
      return idsPerPackage.map((ids) => ids.map((id) => details.get(id)).filter((found): found is StoredAdvisory => !!found));
    },
  };
}

function severityOf(found: OsvVulnerability): AdvisorySeverity {
  if (found.id.startsWith(MALWARE_ID_PREFIX)) {
    return ADVISORY_SEVERITY.critical;
  }
  return SEVERITY_BY_LABEL[found.database_specific?.severity?.toUpperCase() ?? ''] ?? ADVISORY_SEVERITY.unknown;
}

/** Runs `work` over every item with at most MONITORING_CONCURRENCY in flight, keeping the order of results. */
export async function mapWithLimit<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }
  await Promise.all(Array.from({length: Math.min(MONITORING_CONCURRENCY, items.length)}, worker));
  return results;
}
