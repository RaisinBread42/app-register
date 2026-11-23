import {
  ADVISORY_SEVERITY,
  API_HEADER,
  DEPENDENCY_NAME_MAX_LENGTH,
  DEPENDENCY_VERSION_MAX_LENGTH,
  HTTP_METHOD,
  HTTP_STATUS,
  JSON_CONTENT_TYPE,
  MONITORING_CONCURRENCY,
  MONITORING_MAX_RESPONSE_BYTES,
  MONITORING_TIMEOUT_MS,
  MONITORING_USER_AGENT,
  NPM_REGISTRY_URL,
  OSV_API_URL,
  OSV_BATCH_SIZE,
  OSV_ECOSYSTEM_NPM,
  OSV_MAX_PAGES,
  type AdvisorySeverity,
} from '@/lib/constants';
import {readTextUpTo} from '@/lib/capped-body';
import {isAdvisoryId, normaliseAdvisory, type Advisory} from './advisories';
import {isPlainObject} from './validation';

/**
 * The only module that talks to the outside world for dependency monitoring.
 * Two free, keyless sources:
 * - npm registry: `GET {registry}/{name}/latest` → `{ version }` (404 when unknown);
 * - OSV.dev: `POST /v1/querybatch` → advisory ids per package@version (paged with
 *   `next_page_token`), then `GET /v1/vulns/{id}` → summary, aliases and severity.
 * Only package names and versions leave the server. Tests pass a fake `fetch`.
 *
 * Nothing a source says is trusted: an answer that is too long or not in the
 * documented shape counts as no answer (the call throws), so it can never
 * replace a good earlier result.
 */

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type PackageVersion = {name: string; version: string};

/** Both lookups stop early when `signal` aborts (the caller ran out of time). */
export type PackageSources = {
  /** The latest published version, or null when the registry does not know the package. Throws when it gives no usable answer. */
  latestVersion(name: string, signal?: AbortSignal): Promise<string | null>;
  /** Known advisories for each package@version, in the order given. Throws when the source gives no usable answer. */
  advisories(packages: PackageVersion[], signal?: AbortSignal): Promise<Advisory[][]>;
};

/** npm's own rule for package names (older packages may use capitals). Anything else is never sent anywhere. */
const NPM_NAME = /^(@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i;

export function isNpmPackageName(name: string): boolean {
  return name.length <= DEPENDENCY_NAME_MAX_LENGTH && NPM_NAME.test(name);
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

/** One package's place in a batch: `index` is its position in the caller's list. */
type AdvisoryQuery = {index: number; package: PackageVersion; pageToken?: string};
type AdvisoryIdPage = {ids: string[]; nextPageToken?: string};

export function createPackageSources(send: Fetch = fetch): PackageSources {
  async function request(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(MONITORING_TIMEOUT_MS);
    return send(url, {
      ...init,
      headers: {...init.headers, [API_HEADER.userAgent]: MONITORING_USER_AGENT},
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: 'no-store',
    });
  }

  /** The answer as JSON; throws on an error status, a body over the size cap, or text that is not JSON. */
  async function json(response: Response): Promise<unknown> {
    if (!response.ok) {
      throw new Error(`Monitoring source answered ${response.status}`);
    }
    const text = await readTextUpTo(response, MONITORING_MAX_RESPONSE_BYTES);
    if (text === null) {
      throw new Error('Monitoring source answered more than the size cap');
    }
    return JSON.parse(text);
  }

  async function advisory(id: string, signal?: AbortSignal): Promise<Advisory | null> {
    const found = await json(await request(`${OSV_API_URL}/vulns/${encodeURIComponent(id)}`, {}, signal));
    if (!isPlainObject(found)) {
      throw malformed();
    }
    if (found.withdrawn) {
      return null;
    }
    // Stored under the id that was asked for, whatever id the document itself claims.
    return normaliseAdvisory({id, aliases: found.aliases, summary: found.summary, severity: severityOf(id, found)});
  }

  async function advisoryIdPage(queries: AdvisoryQuery[], signal?: AbortSignal): Promise<AdvisoryIdPage[]> {
    const response = await request(
      `${OSV_API_URL}/querybatch`,
      {
        method: HTTP_METHOD.post,
        headers: {[API_HEADER.contentType]: JSON_CONTENT_TYPE},
        body: JSON.stringify({
          queries: queries.map(({package: {name, version}, pageToken}) => ({
            package: {name, ecosystem: OSV_ECOSYSTEM_NPM},
            version,
            ...(pageToken ? {page_token: pageToken} : {}),
          })),
        }),
      },
      signal,
    );
    const answer = await json(response);
    const results = isPlainObject(answer) ? answer.results : undefined;
    if (!Array.isArray(results) || results.length !== queries.length) {
      throw malformed();
    }
    return results.map(readIdPage);
  }

  /**
   * Every advisory id for each package, following `next_page_token` for at most
   * OSV_MAX_PAGES pages. A package with still more pages keeps the ids found so far.
   */
  async function advisoryIds(packages: PackageVersion[], signal?: AbortSignal): Promise<string[][]> {
    const ids = packages.map(() => new Set<string>());
    let pending: AdvisoryQuery[] = packages.map((pkg, index) => ({index, package: pkg}));
    for (let page = 0; page < OSV_MAX_PAGES && pending.length > 0; page++) {
      const answers = await advisoryIdPage(pending, signal);
      const unfinished: AdvisoryQuery[] = [];
      pending.forEach((query, position) => {
        const {ids: found, nextPageToken} = answers[position];
        found.forEach((id) => ids[query.index].add(id));
        if (nextPageToken) {
          unfinished.push({...query, pageToken: nextPageToken});
        }
      });
      pending = unfinished;
    }
    return ids.map((found) => [...found]);
  }

  return {
    async latestVersion(name, signal) {
      // A scoped name keeps its "@" and has its "/" encoded: @types%2Fnode.
      const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(name).replace('%40', '@')}/latest`;
      const response = await request(url, {}, signal);
      if (response.status === HTTP_STATUS.notFound) {
        return null;
      }
      const answer = await json(response);
      const version = isPlainObject(answer) ? answer.version : undefined;
      if (typeof version !== 'string' || version === '' || version.length > DEPENDENCY_VERSION_MAX_LENGTH) {
        throw malformed();
      }
      return version;
    },

    async advisories(packages, signal) {
      const idsPerPackage: string[][] = [];
      for (let start = 0; start < packages.length; start += OSV_BATCH_SIZE) {
        idsPerPackage.push(...(await advisoryIds(packages.slice(start, start + OSV_BATCH_SIZE), signal)));
      }
      const uniqueIds = [...new Set(idsPerPackage.flat())];
      const details = new Map<string, Advisory | null>();
      await mapWithLimit(uniqueIds, async (id) => {
        details.set(id, await advisory(id, signal));
      });
      return idsPerPackage.map((ids) => ids.map((id) => details.get(id)).filter((found): found is Advisory => !!found));
    },
  };
}

function malformed(): Error {
  return new Error('Monitoring source answered in an unexpected shape');
}

/** One package's entry in a batch answer; OSV answers `{}` when it knows no advisory. */
function readIdPage(result: unknown): AdvisoryIdPage {
  const vulns = isPlainObject(result) ? (result.vulns ?? []) : undefined;
  if (!isPlainObject(result) || !Array.isArray(vulns)) {
    throw malformed();
  }
  const ids = vulns.map((vuln: unknown) => (isPlainObject(vuln) ? vuln.id : undefined));
  if (!ids.every(isAdvisoryId)) {
    throw malformed();
  }
  const token = result.next_page_token;
  return {ids, nextPageToken: typeof token === 'string' && token !== '' ? token : undefined};
}

function severityOf(id: string, found: Record<string, unknown>): AdvisorySeverity {
  if (id.startsWith(MALWARE_ID_PREFIX)) {
    return ADVISORY_SEVERITY.critical;
  }
  const label = isPlainObject(found.database_specific) ? found.database_specific.severity : undefined;
  return (typeof label === 'string' && SEVERITY_BY_LABEL[label.toUpperCase()]) || ADVISORY_SEVERITY.unknown;
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
