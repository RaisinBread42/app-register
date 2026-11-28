import {
  API_HEADER,
  API_HOSTING_CATALOG,
  API_MONITORING_DEPENDENCIES_REFRESH,
  API_QUERY,
  API_ROUTES,
  API_SUB_ROUTE,
  BEARER_PREFIX,
  ENV,
  HTTP_METHOD,
  HTTP_STATUS,
  JSON_CONTENT_TYPE,
  type AdvisorySeverity,
  type ApiKeyScope,
  type ApiKeyStatus,
  type AppCriticality,
  type AppEnvironment,
  type AppKind,
  type AuditAction,
  type MatchConfidence,
  type MatchStatus,
  type NoticeCategory,
  type NoticeOrigin,
  type NoticeSeverity,
  type NoticeSource,
  type AppSort,
  type DependencyCheckError,
  type DependencySource,
  type EndOfSupportSource,
  type HealthDimension,
  type HealthStatus,
  type IncidentImpact,
  type IncidentScope,
  type MonitoringSourceStatus,
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
  criticality: AppCriticality | null;
  repositoryUrl: string | null;
};

export type Deduction = {dimension: HealthDimension; label: string; detail: string; points: number};
export type DimensionHealth = {status: HealthStatus; deductions: Deduction[]};
/** `score` is null when nothing is recorded or nothing has been checked yet; a dimension is null until it is monitored. */
export type Health = {
  score: number | null;
  status: HealthStatus;
  dimensions: Record<HealthDimension, DimensionHealth | null>;
};

export type App = AppFields & {
  id: string;
  owner: PersonRef;
  backupOwner: PersonRef | null;
  environments: AppEnvironment[];
  health: Health;
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

export type Advisory = {id: string; aliases: string[]; severity: AdvisorySeverity; summary: string; url: string};

export type Dependency = DependencyFields & {
  id: string;
  appId: string;
  source: DependencySource;
  isDev: boolean;
  advisories: Advisory[];
  checkedAt: string | null;
  checkError: DependencyCheckError | null;
  status: HealthStatus;
  createdAt: string;
  updatedAt: string;
};

export type DependencyImport = {added: number; updated: number; unchanged: number; removed: number};
export type DependencyRefresh = {checked: number; notFound: number; unavailable: number; advisories: number};

type HostingFields = {
  provider: string;
  service: string;
  region: string | null;
  version: string | null;
  runtime: string | null;
  runtimeVersion: string | null;
  endOfSupportOn: string | null;
};

export type HostingIncident = {
  title: string;
  impact: IncidentImpact;
  scope: IncidentScope;
  /** A page on the provider's own status site, or null when the feed gave none. */
  url: string | null;
  startedAt: string | null;
};

/** What the hosting check stores on a row. */
type HostingCheckFields = {
  endOfSupportSource: EndOfSupportSource | null;
  /** The version matched several releases; the date is the earliest among them. */
  isVersionInexact: boolean;
  incidents: HostingIncident[];
  healthCheckedAt: string | null;
  healthError: string | null;
  isMonitored: boolean;
  status: HealthStatus;
};

export type Hosting = HostingFields & HostingCheckFields & {id: string; appId: string; createdAt: string; updatedAt: string};

export type HostingCatalogService = {name: string; hasVersion: boolean; hasRuntime: boolean; isEndOfSupportTracked: boolean};
export type HostingCatalog = {
  providers: {name: string; isStatusMonitored: boolean; services: HostingCatalogService[]}[];
  runtimes: {name: string}[];
};

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

export type AppInput = Omit<AppFields, 'kind' | 'criticality'> & {
  kind: string;
  criticality: string | null;
  ownerId: string;
  backupOwnerId: string | null;
  environments: string[];
};
export type DependencyInput = DependencyFields;
/** `endOfSupportOn` left out keeps the date as it is; null hands a date set by hand back to the hosting check. */
export type HostingInput = Omit<HostingFields, 'endOfSupportOn'> & {endOfSupportOn?: string | null};
export type PersonInput = {name: string; email: string};
export type PersonPatch = Partial<PersonInput> & {status?: PersonStatus; leftOn?: string | null};

export type AppListFilter = {kind?: string; sort?: AppSort; noticeDeadlineWithinDays?: number};
export type AlertListFilter = {status?: string; appId?: string};

export type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopeLabel: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  status: ApiKeyStatus;
  revokedAt: string | null;
  /** Only on create; null on an Idempotency-Key replay. */
  key?: string | null;
};

export type ApiKeyInput = {name: string; expiresOn?: string | null};

export type MonitoringSource = {
  id: string;
  name: string;
  monitors: string;
  status: MonitoringSourceStatus;
  lastRefreshedAt: string | null;
  url: string;
};

export type NoticeMatch = {
  id: string;
  app: PersonRef;
  component: string;
  version: string | null;
  region: string | null;
  matchReason: string;
  confidence: MatchConfidence;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  status: MatchStatus;
  statusNote: string | null;
  snoozedUntil: string | null;
  statusChangedAt: string | null;
  assignee: PersonRef | null;
};

export type Notice = {
  id: string;
  category: NoticeCategory;
  severity: NoticeSeverity;
  title: string;
  summary: string;
  source: NoticeSource;
  sourceName: string;
  sourceUrl: string | null;
  externalId: string | null;
  origin: NoticeOrigin;
  publishedAt: string | null;
  dueOn: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedUpstreamAt: string | null;
  matches: NoticeMatch[];
};

export type NoticeQuery = {appId?: string; severity?: string; category?: string; state?: string};
export type StatusChangeInput = {status: string; note?: string | null; snoozedUntil?: string | null};

export type AuditEvent = {
  id: string;
  occurredAt: string;
  actor: string;
  action: AuditAction;
  subjectKind: string;
  subjectId: string;
  appId: string | null;
  noticeId: string | null;
  fromValue: string | null;
  toValue: string | null;
  snoozedUntil: string | null;
  note: string | null;
};

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
  /** `body` is sent as JSON; `text` is sent as it is (a file that already is JSON). */
  async function request<T>(
    method: string,
    path: string,
    options: {body?: unknown; text?: string; idempotencyKey?: string} = {},
  ): Promise<T> {
    const content = options.text ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    const headers: Record<string, string> = {[API_HEADER.authorization]: BEARER_PREFIX + apiKey};
    if (options.idempotencyKey !== undefined) {
      headers[API_HEADER.idempotencyKey] = options.idempotencyKey;
    }
    if (content !== undefined) {
      headers[API_HEADER.contentType] = JSON_CONTENT_TYPE;
    }
    const response = await send(new URL(path, baseUrl).toString(), {
      method,
      headers,
      body: content,
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
    /** `fileText` is a package.json or package-lock.json, as it is on disk. */
    async importDependencies(idempotencyKey: string, appId: string, fileText: string): Promise<DependencyImport> {
      const path = `${appPath(appId)}/${API_SUB_ROUTE.dependencies}/${API_SUB_ROUTE.import}`;
      return (await request<{import: DependencyImport}>(HTTP_METHOD.post, path, {idempotencyKey, text: fileText})).import;
    },
    /** Safe to repeat, so it sends no Idempotency-Key. */
    async refreshDependencies(appId: string): Promise<DependencyRefresh> {
      const path = `${appPath(appId)}/${API_SUB_ROUTE.dependencies}/${API_SUB_ROUTE.refresh}`;
      return (await request<{refresh: DependencyRefresh}>(HTTP_METHOD.post, path)).refresh;
    },
    async refreshAllDependencies(): Promise<DependencyRefresh & {apps: number}> {
      return (await request<{refresh: DependencyRefresh & {apps: number}}>(HTTP_METHOD.post, API_MONITORING_DEPENDENCIES_REFRESH)).refresh;
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
    /** Safe to repeat, so it sends no Idempotency-Key. */
    async refreshHosting(appId: string): Promise<Hosting[]> {
      const path = `${appPath(appId)}/${API_SUB_ROUTE.hosting}/${API_SUB_ROUTE.refresh}`;
      return (await request<{hosting: Hosting[]}>(HTTP_METHOD.post, path)).hosting;
    },
    async getHostingCatalog(): Promise<HostingCatalog> {
      return (await get<{catalog: HostingCatalog}>(API_HOSTING_CATALOG)).catalog;
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
    async listApiKeys(): Promise<ApiKey[]> {
      return (await get<{apiKeys: ApiKey[]}>(API_ROUTES.apiKeys)).apiKeys;
    },
    async createApiKey(idempotencyKey: string, input: ApiKeyInput): Promise<ApiKey> {
      return (await post<{apiKey: ApiKey}>(API_ROUTES.apiKeys, idempotencyKey, input)).apiKey;
    },
    async revokeApiKey(idempotencyKey: string, id: string): Promise<ApiKey> {
      return (await post<{apiKey: ApiKey}>(`${API_ROUTES.apiKeys}/${segment(id)}/${API_SUB_ROUTE.revoke}`, idempotencyKey)).apiKey;
    },
    async listMonitoringSources(): Promise<MonitoringSource[]> {
      return (await get<{sources: MonitoringSource[]}>(API_ROUTES.monitoringSources)).sources;
    },
    async listNotices(query: NoticeQuery = {}): Promise<Notice[]> {
      const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
      const suffix = search.size ? `?${search}` : '';
      return (await get<{notices: Notice[]}>(`${API_ROUTES.notices}${suffix}`)).notices;
    },
    async changeMatchStatus(idempotencyKey: string, matchId: string, input: StatusChangeInput): Promise<NoticeMatch> {
      return (await post<{match: NoticeMatch}>(`${API_ROUTES.noticeMatches}/${segment(matchId)}/${API_SUB_ROUTE.status}`, idempotencyKey, input)).match;
    },
    async assignMatch(idempotencyKey: string, matchId: string, assigneeId: string | null): Promise<NoticeMatch> {
      return (await post<{match: NoticeMatch}>(`${API_ROUTES.noticeMatches}/${segment(matchId)}/${API_SUB_ROUTE.assign}`, idempotencyKey, {assigneeId})).match;
    },
    async undoMatch(idempotencyKey: string, matchId: string): Promise<NoticeMatch> {
      return (await post<{match: NoticeMatch}>(`${API_ROUTES.noticeMatches}/${segment(matchId)}/${API_SUB_ROUTE.undo}`, idempotencyKey)).match;
    },
    async listAuditEvents(query: {appId?: string; matchId?: string; limit?: number}): Promise<AuditEvent[]> {
      const search = new URLSearchParams(
        Object.entries(query).filter((entry) => entry[1] !== undefined).map(([name, value]) => [name, String(value)]),
      );
      return (await get<{events: AuditEvent[]}>(`${API_ROUTES.auditEvents}?${search}`)).events;
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
