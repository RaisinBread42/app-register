import Ajv2020 from 'ajv/dist/2020';
import {expect} from 'vitest';
import * as apiKeyRevoke from '@/app/api/api-keys/[id]/revoke/route';
import * as apiKeys from '@/app/api/api-keys/route';
import * as appArchive from '@/app/api/apps/[id]/archive/route';
import * as appDependency from '@/app/api/apps/[id]/dependencies/[dependencyId]/route';
import * as appDependencyImport from '@/app/api/apps/[id]/dependencies/import/route';
import * as appDependencyRefresh from '@/app/api/apps/[id]/dependencies/refresh/route';
import * as appDependencies from '@/app/api/apps/[id]/dependencies/route';
import * as appHostingEntry from '@/app/api/apps/[id]/hosting/[hostingId]/route';
import * as appHostingRefresh from '@/app/api/apps/[id]/hosting/refresh/route';
import * as appHosting from '@/app/api/apps/[id]/hosting/route';
import * as appById from '@/app/api/apps/[id]/route';
import * as apps from '@/app/api/apps/route';
import * as hostingCatalog from '@/app/api/hosting/catalog/route';
import * as monitoringDependencyRefresh from '@/app/api/monitoring/dependencies/refresh/route';
import * as monitoringHostingRefresh from '@/app/api/monitoring/hosting/refresh/route';
import * as monitoringRefresh from '@/app/api/monitoring/refresh/route';
import * as acknowledge from '@/app/api/notice-alerts/[id]/acknowledge/route';
import * as alerts from '@/app/api/notice-alerts/route';
import * as openapi from '@/app/api/openapi.json/route';
import * as personById from '@/app/api/people/[id]/route';
import * as people from '@/app/api/people/route';
import * as monitoringSources from '@/app/api/settings/monitoring-sources/route';
import * as noticeById from '@/app/api/notices/[id]/route';
import * as noticesRoute from '@/app/api/notices/route';
import * as matchStatus from '@/app/api/notice-matches/[id]/status/route';
import * as matchAssign from '@/app/api/notice-matches/[id]/assign/route';
import * as matchUndo from '@/app/api/notice-matches/[id]/undo/route';
import * as auditEventsRoute from '@/app/api/audit-events/route';
import {API_HEADER, BEARER_PREFIX, IDEMPOTENT_METHODS} from '@/lib/constants';
import {openApiSpec} from '../openapi';

/** Test-only: sends requests straight to the route handlers, as Next.js would. */

type Handler = (request: Request, context: {params: Promise<Record<string, string>>}) => Promise<Response> | Response;

/** Spec path template → route module. Kept in the same order as the spec. */
export const ROUTES: Record<string, Record<string, unknown>> = {
  '/api/apps': apps,
  '/api/apps/{id}': appById,
  '/api/apps/{id}/archive': appArchive,
  '/api/apps/{id}/dependencies': appDependencies,
  '/api/apps/{id}/dependencies/import': appDependencyImport,
  '/api/apps/{id}/dependencies/refresh': appDependencyRefresh,
  '/api/apps/{id}/dependencies/{dependencyId}': appDependency,
  '/api/apps/{id}/hosting': appHosting,
  // Before `{hostingId}`: a fixed segment wins over a parameter, as in Next.js.
  '/api/apps/{id}/hosting/refresh': appHostingRefresh,
  '/api/apps/{id}/hosting/{hostingId}': appHostingEntry,
  '/api/hosting/catalog': hostingCatalog,
  '/api/monitoring/dependencies/refresh': monitoringDependencyRefresh,
  '/api/monitoring/hosting/refresh': monitoringHostingRefresh,
  '/api/monitoring/refresh': monitoringRefresh,
  '/api/people': people,
  '/api/people/{id}': personById,
  '/api/notice-alerts': alerts,
  '/api/notice-alerts/{id}/acknowledge': acknowledge,
  '/api/api-keys': apiKeys,
  '/api/api-keys/{id}/revoke': apiKeyRevoke,
  '/api/settings/monitoring-sources': monitoringSources,
  '/api/notices': noticesRoute,
  '/api/notices/{id}': noticeById,
  '/api/notice-matches/{id}/status': matchStatus,
  '/api/notice-matches/{id}/assign': matchAssign,
  '/api/notice-matches/{id}/undo': matchUndo,
  '/api/audit-events': auditEventsRoute,
  '/api/openapi.json': openapi,
};

const ajv = new Ajv2020({strict: false, validateFormats: false, allErrors: true});
ajv.addSchema(openApiSpec as object, 'openapi');

export type ApiCall = {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON from the API
  headers: Headers;
};

export type RequestOptions = {
  body?: unknown;
  key?: string | null;
  idempotencyKey?: string | null;
  headers?: Record<string, string>;
};

/**
 * Calls `METHOD /path?query` and asserts the response matches the OpenAPI schema
 * documented for that path, method and status. A status the spec does not list fails.
 */
export async function callApi(
  apiKey: string,
  method: string,
  url: string,
  options: RequestOptions = {},
): Promise<ApiCall> {
  const [pathname] = url.split('?');
  const {template, params} = matchRoute(pathname);
  const handler = ROUTES[template][method] as Handler | undefined;
  if (!handler) {
    throw new Error(`No ${method} handler for ${template}`);
  }

  const headers = new Headers({'content-type': 'application/json', ...options.headers});
  const key = options.key === undefined ? apiKey : options.key;
  if (key !== null) {
    headers.set(API_HEADER.authorization, BEARER_PREFIX + key);
  }
  const idempotencyKey =
    options.idempotencyKey === undefined ? crypto.randomUUID() : options.idempotencyKey;
  if (idempotencyKey !== null && (IDEMPOTENT_METHODS as readonly string[]).includes(method)) {
    headers.set(API_HEADER.idempotencyKey, idempotencyKey);
  }
  const body =
    options.body === undefined
      ? undefined
      : typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body);

  const response = await handler(new Request(`http://localhost${url}`, {method, headers, body}), {
    params: Promise.resolve(params),
  });
  const text = await response.text();
  const call = {status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers};
  expectMatchesSpec(template, method, call);
  return call;
}

function expectMatchesSpec(template: string, method: string, call: ApiCall): void {
  const operation = (openApiSpec.paths as Record<string, Record<string, {responses: Record<string, unknown>}>>)[
    template
  ][method.toLowerCase()];
  const documented = operation.responses[call.status] as
    | {content?: Record<string, unknown>}
    | undefined;
  expect(documented, `${method} ${template} answered ${call.status}, which the spec does not list`).toBeDefined();
  if (!documented?.content || template === '/api/openapi.json') {
    return;
  }
  const pointer = ['paths', template, method.toLowerCase(), 'responses', String(call.status), 'content', 'application/json', 'schema']
    .map((segment) => encodeURIComponent(segment.replace(/~/g, '~0').replace(/\//g, '~1')))
    .join('/');
  const validate = ajv.getSchema(`openapi#/${pointer}`);
  if (!validate) {
    throw new Error(`No schema at ${pointer}`);
  }
  const valid = validate(call.body);
  expect(valid, `${method} ${template} ${call.status}: ${ajv.errorsText(validate.errors)}`).toBe(true);
}

function matchRoute(pathname: string): {template: string; params: Record<string, string>} {
  for (const template of Object.keys(ROUTES)) {
    const names: string[] = [];
    const pattern = template.replace(/\{(\w+)\}/g, (_, name: string) => {
      names.push(name);
      return '([^/]+)';
    });
    const match = new RegExp(`^${pattern.replace(/\./g, '\\.')}$`).exec(pathname);
    if (match) {
      return {
        template,
        params: Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(match[i + 1])])),
      };
    }
  }
  throw new Error(`No route for ${pathname}`);
}

/**
 * A `fetch` that answers from the route handlers instead of the network, and
 * checks each response against the spec: lets the UI's API client run for real.
 */
export async function fetchFromRoutes(input: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(input, init);
  const {pathname} = new URL(request.url);
  const {template, params} = matchRoute(pathname);
  const handler = ROUTES[template][request.method] as Handler | undefined;
  if (!handler) {
    throw new Error(`No ${request.method} handler for ${template}`);
  }
  const response = await handler(request, {params: Promise.resolve(params)});
  const text = await response.clone().text();
  expectMatchesSpec(template, request.method, {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    headers: response.headers,
  });
  return response;
}
