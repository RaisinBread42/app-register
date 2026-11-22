import {
  API_HEADER,
  API_QUERY,
  API_ROUTES,
  API_SUB_ROUTE,
  BEARER_PREFIX,
  ENV,
  HTTP_METHOD,
  HTTP_STATUS,
  JSON_CONTENT_TYPE,
  type AppKind,
  type AppSort,
  type NoticeAlertStatus,
  type PersonStatus,
} from '@/lib/constants';

/**
 * The one way the UI talks to the JSON API: server side only, over HTTP, with
 * the bearer key from APP_REGISTER_API_KEY. Never import this from a client
 * component. Types mirror the schemas in `src/lib/api/openapi.ts`.
 */

// Response shapes (OpenAPI components/schemas).

export type PersonRef = {id: string; name: string};

type AppFields = {
  name: string;
  kind: AppKind;
  category: string | null;
  vendor: string | null;
  description: string | null;
  renewalDate: string | null;
  noticeDeadline: string | null;
  billingCycle: string | null;
  costCents: number | null;
  runtimeLocation: string | null;
  dataAndKeys: string | null;
  whatBreaksIfStopped: string | null;
};

export type App = AppFields & {
  id: string;
  owner: PersonRef;
  backupOwner: PersonRef;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoticeAlert = {
  id: string;
  appId: string;
  appName: string;
  noticeDeadline: string;
  offsetDays: number;
  dueOn: string;
  status: NoticeAlertStatus;
  sentAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedById: string | null;
  createdAt: string;
  updatedAt: string;
};

type DependencyFields = {
  name: string;
  currentVersion: string;
  latestVersion: string | null;
  vulnerabilities: string[];
  recommendedAction: string | null;
};

export type Dependency = DependencyFields & {id: string; appId: string; createdAt: string; updatedAt: string};

type HostingFields = {
  provider: string;
  service: string;
  region: string | null;
  version: string | null;
  endOfSupportOn: string | null;
};

export type Hosting = HostingFields & {id: string; appId: string; createdAt: string; updatedAt: string};

export type AppDetail = App & {alerts: NoticeAlert[]; dependencies: Dependency[]; hosting: Hosting[]};

export type Person = {
  id: string;
  name: string;
  email: string;
  status: PersonStatus;
  leftOn: string | null;
  createdAt: string;
  updatedAt: string;
};

// Request shapes (AppInput, PersonPatch, …).

export type AppInput = Omit<AppFields, 'kind'> & {kind: string; ownerId: string; backupOwnerId: string};
export type DependencyInput = DependencyFields;
export type HostingInput = HostingFields;
export type PersonInput = {name: string; email: string};
export type PersonPatch = Partial<PersonInput> & {status?: PersonStatus; leftOn?: string | null};

export type AppListFilter = {kind?: string; sort?: AppSort; noticeDeadlineWithinDays?: number};
export type AlertListFilter = {status?: string; appId?: string};

/** A non-2xx answer from the API; `message` is the API's `{ error }` text. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export type ApiClientConfig = {baseUrl: string; apiKey: string; fetch?: Fetch};

/** Ids are UUIDs. Anything else (a slash, `..`) could step into another API path, so it is a 404 here. */
const ID_SEGMENT = /^[A-Za-z0-9-]+$/;
function segment(id: string): string {
  if (!ID_SEGMENT.test(id)) {
    throw new ApiError(HTTP_STATUS.notFound, 'Not found');
  }
  return id;
}
const appPath = (id: string) => `${API_ROUTES.apps}/${segment(id)}`;

export function createApiClient({baseUrl, apiKey, fetch: send = fetch}: ApiClientConfig) {
  async function request<T>(method: string, path: string, options: {body?: unknown; idempotencyKey?: string} = {}): Promise<T> {
    const headers: Record<string, string> = {[API_HEADER.authorization]: BEARER_PREFIX + apiKey};
    if (options.idempotencyKey !== undefined) {
      headers[API_HEADER.idempotencyKey] = options.idempotencyKey;
    }
    if (options.body !== undefined) {
      headers[API_HEADER.contentType] = JSON_CONTENT_TYPE;
    }
    const response = await send(new URL(path, baseUrl).toString(), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
    });
    if (response.status === HTTP_STATUS.noContent) {
      return undefined as T;
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(response.status, typeof json.error === 'string' ? json.error : response.statusText);
    }
    return json as T;
  }

  const get = <T>(path: string) => request<T>(HTTP_METHOD.get, path);
  const post = <T>(path: string, idempotencyKey: string, body?: unknown) =>
    request<T>(HTTP_METHOD.post, path, {idempotencyKey, body});
  const patch = <T>(path: string, idempotencyKey: string, body: unknown) =>
    request<T>(HTTP_METHOD.patch, path, {idempotencyKey, body});
  const remove = (path: string) => request<void>(HTTP_METHOD.delete, path);

  return {
    async listApps(filter: AppListFilter = {}): Promise<App[]> {
      const query = new URLSearchParams();
      if (filter.kind) query.set(API_QUERY.kind, filter.kind);
      if (filter.sort) query.set(API_QUERY.sort, filter.sort);
      if (filter.noticeDeadlineWithinDays !== undefined) {
        query.set(API_QUERY.noticeDeadlineWithinDays, String(filter.noticeDeadlineWithinDays));
      }
      return (await get<{apps: App[]}>(`${API_ROUTES.apps}?${query}`)).apps;
    },
    async getApp(id: string): Promise<AppDetail> {
      return (await get<{app: AppDetail}>(appPath(id))).app;
    },
    async createApp(idempotencyKey: string, input: AppInput): Promise<AppDetail> {
      return (await post<{app: AppDetail}>(API_ROUTES.apps, idempotencyKey, input)).app;
    },
    async updateApp(idempotencyKey: string, id: string, input: Partial<AppInput>): Promise<AppDetail> {
      return (await patch<{app: AppDetail}>(appPath(id), idempotencyKey, input)).app;
    },
    async archiveApp(idempotencyKey: string, id: string): Promise<AppDetail> {
      return (await post<{app: AppDetail}>(`${appPath(id)}/${API_SUB_ROUTE.archive}`, idempotencyKey)).app;
    },
    async addDependency(idempotencyKey: string, appId: string, input: DependencyInput): Promise<Dependency> {
      return (await post<{dependency: Dependency}>(`${appPath(appId)}/${API_SUB_ROUTE.dependencies}`, idempotencyKey, input)).dependency;
    },
    async updateDependency(idempotencyKey: string, appId: string, id: string, input: DependencyInput): Promise<Dependency> {
      const path = `${appPath(appId)}/${API_SUB_ROUTE.dependencies}/${segment(id)}`;
      return (await patch<{dependency: Dependency}>(path, idempotencyKey, input)).dependency;
    },
    removeDependency(appId: string, id: string): Promise<void> {
      return remove(`${appPath(appId)}/${API_SUB_ROUTE.dependencies}/${segment(id)}`);
    },
    async addHosting(idempotencyKey: string, appId: string, input: HostingInput): Promise<Hosting> {
      return (await post<{hosting: Hosting}>(`${appPath(appId)}/${API_SUB_ROUTE.hosting}`, idempotencyKey, input)).hosting;
    },
    async updateHosting(idempotencyKey: string, appId: string, id: string, input: HostingInput): Promise<Hosting> {
      const path = `${appPath(appId)}/${API_SUB_ROUTE.hosting}/${segment(id)}`;
      return (await patch<{hosting: Hosting}>(path, idempotencyKey, input)).hosting;
    },
    removeHosting(appId: string, id: string): Promise<void> {
      return remove(`${appPath(appId)}/${API_SUB_ROUTE.hosting}/${segment(id)}`);
    },
    async listPeople(): Promise<Person[]> {
      return (await get<{people: Person[]}>(API_ROUTES.people)).people;
    },
    async createPerson(idempotencyKey: string, input: PersonInput): Promise<Person> {
      return (await post<{person: Person}>(API_ROUTES.people, idempotencyKey, input)).person;
    },
    async updatePerson(idempotencyKey: string, id: string, input: PersonPatch): Promise<Person> {
      return (await patch<{person: Person}>(`${API_ROUTES.people}/${segment(id)}`, idempotencyKey, input)).person;
    },
    async listAlerts(filter: AlertListFilter = {}): Promise<NoticeAlert[]> {
      const query = new URLSearchParams();
      if (filter.status) query.set(API_QUERY.status, filter.status);
      if (filter.appId) query.set(API_QUERY.appId, filter.appId);
      return (await get<{alerts: NoticeAlert[]}>(`${API_ROUTES.noticeAlerts}?${query}`)).alerts;
    },
    async acknowledgeAlert(idempotencyKey: string, id: string): Promise<NoticeAlert> {
      return (await post<{alert: NoticeAlert}>(`${API_ROUTES.noticeAlerts}/${segment(id)}/${API_SUB_ROUTE.acknowledge}`, idempotencyKey)).alert;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** The client the UI server uses, configured from APP_URL and APP_REGISTER_API_KEY. */
export function apiClient(): ApiClient {
  const baseUrl = process.env[ENV.appUrl];
  const apiKey = process.env[ENV.apiKey];
  if (!baseUrl || !apiKey) {
    throw new Error(`${ENV.appUrl} and ${ENV.apiKey} must be set for the UI to reach the API`);
  }
  return createApiClient({baseUrl, apiKey});
}
