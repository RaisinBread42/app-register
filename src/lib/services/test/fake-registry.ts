import {NPM_REGISTRY_URL, OSV_API_URL} from '@/lib/constants';
import type {Fetch} from '../package-sources';

/** Test-only: a `fetch` that answers like the npm registry and OSV.dev, and records what it was asked. */

export type FakeAdvisory = {id: string; severity?: string; summary?: string; aliases?: string[]; withdrawn?: string};

export type FakeRegistry = {
  /** Package name → latest version. A name not listed answers 404. */
  latest: Record<string, string>;
  /** `name@version` → advisories OSV knows for it. */
  advisories?: Record<string, FakeAdvisory[]>;
  /** Package names whose registry lookup fails with a 503. */
  down?: string[];
  /** When true, OSV answers 503. */
  isOsvDown?: boolean;
};

export type RecordedRequest = {url: string; method: string; headers: Record<string, string>; body: string | null};

export function fakeRegistry(registry: FakeRegistry): {fetch: Fetch; requests: RecordedRequest[]} {
  const requests: RecordedRequest[] = [];
  const known = Object.values(registry.advisories ?? {}).flat();

  const fetch: Fetch = async (url, init = {}) => {
    const body = typeof init.body === 'string' ? init.body : null;
    requests.push({url, method: init.method ?? 'GET', headers: {...(init.headers as Record<string, string>)}, body});

    if (url.startsWith(`${NPM_REGISTRY_URL}/`)) {
      const name = decodeURIComponent(url.slice(NPM_REGISTRY_URL.length + 1).replace(/\/latest$/, ''));
      if (registry.down?.includes(name)) {
        return Response.json({error: 'unavailable'}, {status: 503});
      }
      const version = registry.latest[name];
      return version ? Response.json({name, version}) : Response.json('Not Found', {status: 404});
    }
    if (registry.isOsvDown) {
      return Response.json({error: 'unavailable'}, {status: 503});
    }
    if (url === `${OSV_API_URL}/querybatch`) {
      const {queries} = JSON.parse(body ?? '{}') as {queries: {package: {name: string}; version: string}[]};
      return Response.json({
        results: queries.map((query) => {
          const found = registry.advisories?.[`${query.package.name}@${query.version}`];
          return found ? {vulns: found.map(({id}) => ({id, modified: '2026-11-01T00:00:00Z'}))} : {};
        }),
      });
    }
    const advisory = known.find(({id}) => url === `${OSV_API_URL}/vulns/${id}`);
    if (!advisory) {
      return Response.json({code: 5, message: 'Bug not found.'}, {status: 404});
    }
    const {severity, ...rest} = advisory;
    return Response.json({...rest, database_specific: severity ? {severity} : {}});
  };
  return {fetch, requests};
}
