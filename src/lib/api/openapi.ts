import {
  ADVISORY_ID_MAX_LENGTH,
  ADVISORY_SEVERITIES,
  API_KEY_NAME_MAX_LENGTH,
  API_KEY_SCOPES,
  API_KEY_STATUSES,
  BYTES_PER_MB,
  APP_CRITICALITIES,
  APP_ENVIRONMENTS,
  APP_KINDS,
  MATCH_CONFIDENCES,
  NOTICE_CATEGORIES,
  NOTICE_ORIGINS,
  NOTICE_SEVERITIES,
  NOTICE_SOURCES,
  NOTICE_STATES,
  APP_SORTS,
  DEPENDENCY_CHECK_ERRORS,
  END_OF_SUPPORT_SOON_DAYS,
  END_OF_SUPPORT_SOURCES,
  HOSTING_MAX_INCIDENTS,
  HOSTING_NAME_MAX_LENGTH,
  HOSTING_POINTS,
  HOSTING_VERSION_MAX_LENGTH,
  MONITORING_FOLLOW_UP_BUDGET_MS,
  MONITORING_SOURCE_STATUSES,
  DEPENDENCY_IMPORT_MAX_BYTES,
  DEPENDENCY_NAME_MAX_LENGTH,
  DEPENDENCY_VERSION_MAX_LENGTH,
  DEPENDENCY_SOURCES,
  HEALTH_ATTENTION_BELOW,
  HEALTH_CRITICAL_BELOW,
  HEALTH_DIMENSION,
  HEALTH_DIMENSIONS,
  HEALTH_MAX_SCORE,
  HEALTH_STATUSES,
  RANGE_VERSION_POINTS,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_TTL_HOURS,
  INCIDENT_IMPACTS,
  INCIDENT_SCOPES,
  NOTICE_ALERT_STATUSES,
  NOTICE_WINDOW_MAX_DAYS,
  PERSON_STATUSES,
  REPOSITORY_URL_MAX_LENGTH,
} from '@/lib/constants';

/**
 * Hand-written OpenAPI 3.1 document for every route in `src/app/api/`.
 * `src/app/api/api.test.ts` checks each real response against these schemas
 * and that every route file is listed here, so the two cannot drift apart.
 */

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({$ref: `#/components/schemas/${name}`});
const nullable = (type: string, extra: Schema = {}): Schema => ({type: [type, 'null'], ...extra});
const text: Schema = {type: 'string'};
const id: Schema = {type: 'string', format: 'uuid'};
const day: Schema = {type: 'string', format: 'date'};
const timestamp: Schema = {type: 'string', format: 'date-time'};

/** A response object with these required keys and nothing else. */
function strict(properties: Record<string, Schema>, optional: string[] = []): Schema {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties).filter((key) => !optional.includes(key)),
    properties,
  };
}

/** A request body: every key optional unless listed. */
function input(properties: Record<string, Schema>, required: string[] = []): Schema {
  return {type: 'object', required, properties};
}

function json(schema: Schema, description: string) {
  return {description, content: {'application/json': {schema}}};
}

const errors = {
  400: json(ref('Error'), 'Invalid input, missing Idempotency-Key, or a duplicate name/email'),
  401: json(ref('Error'), 'Missing, unknown, revoked or expired API key'),
  403: json(ref('Error'), 'API key is valid but not scoped for this action'),
  404: json(ref('Error'), 'Unknown id, malformed id, or an id from another workspace'),
  422: json(ref('Error'), 'Idempotency-Key already used for a different request'),
  500: json(ref('Error'), 'Unexpected error (details are logged by error code only)'),
};

const pathId = (name: string, description: string) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: {type: 'string'},
});

const idempotencyKey = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  description:
    `Any unique string (a UUID is ideal), 1–${IDEMPOTENCY_KEY_MAX_LENGTH} characters. ` +
    `Repeating a request with the same key and the same body within ${IDEMPOTENCY_KEY_TTL_HOURS} hours does not run it again: ` +
    `a replay returns the same status and the resource's current state (404 if it has been deleted since). ` +
    `An import replays the counts of its first run.`,
  schema: {type: 'string', minLength: 1, maxLength: IDEMPOTENCY_KEY_MAX_LENGTH},
};

const appFields = {
  name: text,
  kind: {type: 'string', enum: [...APP_KINDS]},
  category: nullable('string'),
  vendor: nullable('string'),
  description: nullable('string'),
  renewalDate: nullable('string', {format: 'date'}),
  noticeDeadline: nullable('string', {format: 'date'}),
  billingCycle: nullable('string'),
  costCents: nullable('integer', {minimum: 0}),
  runtimeLocation: nullable('string'),
  dataAndKeys: nullable('string'),
  whatBreaksIfStopped: nullable('string'),
  criticality: {type: ['string', 'null'], enum: [...APP_CRITICALITIES, null], description: 'Business criticality; null until set'},
  repositoryUrl: nullable('string', {format: 'uri', maxLength: REPOSITORY_URL_MAX_LENGTH, description: 'https:// only'}),
};

const environments: Schema = {type: 'array', items: {type: 'string', enum: [...APP_ENVIRONMENTS]}, uniqueItems: true};

const personRef = strict({id, name: text});

const appProperties = {
  id,
  ...appFields,
  owner: personRef,
  backupOwner: {oneOf: [personRef, {type: 'null'}], description: 'Optional; null when the app has none'},
  environments,
  health: ref('Health'),
  archivedAt: nullable('string', {format: 'date-time'}),
  createdAt: timestamp,
  updatedAt: timestamp,
};

const appInputFields = {
  ...appFields,
  ownerId: {...id, description: 'Must be an active person when newly assigned'},
  backupOwnerId: {type: ['string', 'null'], format: 'uuid', description: 'Optional. Must differ from ownerId; null clears it'},
  environments: {...environments, description: 'Where it runs. On PATCH, leave it out to keep the current list'},
};

const dependencyFields = {
  name: {...text, maxLength: DEPENDENCY_NAME_MAX_LENGTH, description: 'Changing it clears what monitoring found'},
  currentVersion: {
    ...text,
    maxLength: DEPENDENCY_VERSION_MAX_LENGTH,
    description: 'Changing it clears the advisories and check state, which were about the old version',
  },
  latestVersion: nullable('string', {maxLength: DEPENDENCY_VERSION_MAX_LENGTH}),
  vulnerabilities: {
    type: 'array',
    items: {...text, maxLength: ADVISORY_ID_MAX_LENGTH},
    description: 'Advisory ids, e.g. CVE-2026-1234',
  },
  recommendedAction: nullable('string'),
};

const count: Schema = {type: 'integer', minimum: 0};
const healthStatus: Schema = {type: 'string', enum: [...HEALTH_STATUSES]};

/** What monitoring stores on a dependency; read-only in the API. */
const dependencyMonitoring = {
  source: {
    type: 'string',
    enum: [...DEPENDENCY_SOURCES],
    description: 'How it got here. An import only removes dependencies an import created.',
  },
  isDev: {type: 'boolean', description: 'A devDependency in the imported file'},
  advisories: {
    type: 'array',
    items: ref('Advisory'),
    description: 'Advisories OSV knows for the tracked version',
  },
  checkedAt: {
    ...nullable('string', {format: 'date-time'}),
    description:
      'When the registry and OSV last both answered for this name and version. ' +
      'null until then: not checked yet, a check that failed, a package the registry does not know, or a version that is a range.',
  },
  checkError: {
    type: ['string', 'null'],
    enum: [...DEPENDENCY_CHECK_ERRORS, null],
    description:
      'not_found: not on the public npm registry. unavailable: a source gave no usable answer, the previous result is kept. ' +
      'invalid_version: the tracked version is a range or tag, so advisories cannot be checked ' +
      '(import package-lock.json for exact versions).',
  },
  status: {
    ...healthStatus,
    description:
      'critical with a critical or high advisory; attention with anything else that costs points, which a version that is ' +
      'a range always does; ok only once the registry and OSV have both answered for this name and version; ' +
      'otherwise na (not checked yet, the check failed, or the registry does not know the package: see checkError).',
  },
};

const refreshCounts = {
  checked: {...count, description: 'Dependencies a source was asked about'},
  notFound: {...count, description: 'Not on the public npm registry'},
  unavailable: {...count, description: 'A source gave no usable answer; the previous result was kept'},
  advisories: {...count, description: 'Advisories now known across the checked dependencies'},
};

const hostingFields = {
  provider: {...text, maxLength: HOSTING_NAME_MAX_LENGTH, examples: ['Azure', 'AWS', 'Vercel']},
  service: {...text, maxLength: HOSTING_NAME_MAX_LENGTH, examples: ['SQL Server', 'App Service']},
  region: nullable('string', {maxLength: HOSTING_NAME_MAX_LENGTH}),
  version: {
    ...nullable('string', {maxLength: HOSTING_VERSION_MAX_LENGTH}),
    description: 'Version of the service itself, e.g. 16 for a database',
  },
  runtime: {...nullable('string', {maxLength: HOSTING_NAME_MAX_LENGTH}), examples: ['Node.js', 'Python', '.NET']},
  runtimeVersion: {...nullable('string', {maxLength: HOSTING_VERSION_MAX_LENGTH}), examples: ['22']},
  endOfSupportOn: {
    ...nullable('string', {format: 'date'}),
    description:
      'Send a date to set it by hand: any date a client sends is kept as `manual` and never overwritten, ' +
      'also when it equals the date the check had found. On PATCH, leave the field out to keep the date as it is ' +
      '(looked up or set by hand). Send null to hand a date set by hand back to the hosting check, which looks it up on ' +
      'endoflife.date from the service version or the runtime version; the row is then unchecked (status na) until ' +
      'that check completes. null does nothing to a looked-up date.',
  },
};

/** What the hosting check stores on a row; read-only. */
const hostingCheckFields = {
  endOfSupportSource: {type: ['string', 'null'], enum: [...END_OF_SUPPORT_SOURCES, null]},
  isVersionInexact: {
    type: 'boolean',
    description:
      'true when the version or runtime version matched more than one release on endoflife.date (e.g. MySQL "8" is 8.0 and 8.4), ' +
      'so endOfSupportOn is the earliest date among them. Always false for a date set by hand.',
  },
  incidents: {
    type: 'array',
    items: ref('HostingIncident'),
    maxItems: HOSTING_MAX_INCIDENTS,
    description:
      'Open provider incidents and announced maintenance that reach this row, as the last check found them: ' +
      'outages on the row’s own service first. Stored as rows of hosting_incidents.',
  },
  healthCheckedAt: {
    ...nullable('string', {format: 'date-time'}),
    description:
      'When the hosting check last ran for this row as it is now. null until then; ' +
      'changing the provider, service, region, version or runtime sets it back to null.',
  },
  healthError: {
    ...nullable('string'),
    description: 'Sources that could not be read on the last check; what earlier checks found from them is kept',
  },
  isMonitored: {
    type: 'boolean',
    description: 'false when the check has nothing to look at: no end-of-support date and no watched status feed for the provider',
  },
  status: {
    ...healthStatus,
    description:
      'critical when past end of support or in an outage (a major incident the feed ties to this service or region); ' +
      'attention for any other finding; ok only when the row is monitored and its last check read every source; ' +
      'otherwise na (not monitored, not checked yet, or the last check failed: see healthError).',
  },
};

const schemas = {
  Error: strict({error: text}),
  App: strict(appProperties),
  AppDetail: strict({
    ...appProperties,
    alerts: {type: 'array', items: ref('NoticeAlert')},
    dependencies: {type: 'array', items: ref('Dependency')},
    hosting: {type: 'array', items: ref('Hosting')},
  }),
  AppInput: input(appInputFields, ['name', 'kind', 'ownerId']),
  AppPatch: input(appInputFields),
  Person: strict({
    id,
    name: text,
    email: {type: 'string', format: 'email'},
    status: {type: 'string', enum: [...PERSON_STATUSES]},
    leftOn: nullable('string', {format: 'date'}),
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
  PersonInput: input({name: text, email: text}, ['name', 'email']),
  PersonPatch: input({
    name: text,
    email: text,
    status: {type: 'string', enum: [...PERSON_STATUSES]},
    leftOn: {...nullable('string', {format: 'date'}), description: 'Required when status is left'},
  }),
  NoticeAlert: strict({
    id,
    appId: id,
    appName: text,
    noticeDeadline: day,
    offsetDays: {type: 'integer', minimum: 1},
    dueOn: day,
    status: {type: 'string', enum: [...NOTICE_ALERT_STATUSES]},
    sentAt: nullable('string', {format: 'date-time'}),
    acknowledgedAt: nullable('string', {format: 'date-time'}),
    acknowledgedById: nullable('string', {format: 'uuid'}),
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
  Dependency: strict({
    id,
    appId: id,
    ...dependencyFields,
    ...dependencyMonitoring,
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
  Advisory: strict({
    id: {...text, examples: ['GHSA-p6mc-m468-83gw']},
    aliases: {type: 'array', items: text, description: 'Other ids for the same advisory, e.g. its CVE'},
    severity: {type: 'string', enum: [...ADVISORY_SEVERITIES]},
    summary: text,
    url: {type: 'string', format: 'uri'},
  }),
  Deduction: strict({
    dimension: {type: 'string', enum: [...HEALTH_DIMENSIONS]},
    label: text,
    detail: text,
    points: {type: 'integer', minimum: 0, description: 'Points taken off the score'},
  }),
  DimensionHealth: strict({
    status: {
      ...healthStatus,
      description: 'From the points this dimension lost. na: the app records nothing for it, or none of it is monitored and checked',
    },
    deductions: {type: 'array', items: ref('Deduction'), description: 'Largest first'},
  }),
  Health: {
    ...strict({
      score: {
        ...nullable('integer', {minimum: 0, maximum: HEALTH_MAX_SCORE}),
        description:
          'null when no monitored dimension has anything checked: no dependencies or none of them checked yet, ' +
          'and no monitored hosting or none of it checked yet',
      },
      status: healthStatus,
      dimensions: strict(
        Object.fromEntries(
          HEALTH_DIMENSIONS.map((dimension) => [
            dimension,
            {oneOf: [ref('DimensionHealth'), {type: 'null'}], description: 'null: not monitored yet'},
          ]),
        ),
      ),
    }),
    description:
      `Starts at ${HEALTH_MAX_SCORE} and loses the points of every deduction (floor 0). ` +
      `Below ${HEALTH_CRITICAL_BELOW} is critical, below ${HEALTH_ATTENTION_BELOW} is attention, otherwise ok. ` +
      `\`${HEALTH_DIMENSION.dependencies}\` and \`${HEALTH_DIMENSION.hosting}\` are monitored; ` +
      `\`${HEALTH_DIMENSION.licence}\` and \`${HEALTH_DIMENSION.pricing}\` are not yet (null). ` +
      `Hosting loses ${HOSTING_POINTS.pastEndOfSupport} per row past its end-of-support date, ` +
      `${HOSTING_POINTS.endOfSupportSoon} per row within ${END_OF_SUPPORT_SOON_DAYS} days of it, ` +
      `${HOSTING_POINTS.outage} per outage and ${HOSTING_POINTS.notice} per other provider notice (each incident once).`,
  },
  DependencyImport: strict({
    added: count,
    updated: {...count, description: 'Known dependencies whose version changed'},
    unchanged: count,
    removed: {...count, description: 'Imported earlier and no longer in the file'},
  }),
  DependencyRefresh: strict(refreshCounts),
  WorkspaceDependencyRefresh: strict({apps: {...count, description: 'Active apps with dependencies'}, ...refreshCounts}),
  PackageFile: {
    type: 'object',
    description:
      'An npm package.json or package-lock.json (lockfileVersion 2 or 3), sent as it is on disk. ' +
      'It must have `lockfileVersion` and `packages`, or at least one of `dependencies`, `devDependencies` and ' +
      `\`optionalDependencies\` (an empty one counts). At most ${DEPENDENCY_IMPORT_MAX_BYTES / BYTES_PER_MB} MB.`,
  },
  DependencyInput: input(dependencyFields, ['name', 'currentVersion']),
  DependencyPatch: input(dependencyFields),
  Hosting: strict({id, appId: id, ...hostingFields, ...hostingCheckFields, createdAt: timestamp, updatedAt: timestamp}),
  HostingIncident: strict({
    title: text,
    impact: {type: 'string', enum: [...INCIDENT_IMPACTS]},
    scope: {
      type: 'string',
      enum: [...INCIDENT_SCOPES],
      description:
        'service: the feed names this service or region. provider: a notice, not an outage on this row: the feed only names ' +
        'the provider, names other regions in free text, or names regions this row’s region cannot be compared with.',
    },
    url: {
      ...nullable('string', {format: 'uri'}),
      description: "An https link on the provider's own status host; null when the feed gave no such link",
    },
    startedAt: nullable('string', {format: 'date-time'}),
  }),
  WorkspaceHostingRefresh: strict({
    apps: {...count, description: 'Active apps a hosting answer was stored for'},
    hosting: {...count, description: 'Hosting rows an answer was stored on'},
    failedSources: {type: 'array', items: text, description: 'Sources that could not be read, each named once'},
  }),
  HostingCatalog: strict({
    providers: {
      type: 'array',
      items: strict({
        name: text,
        isStatusMonitored: {type: 'boolean'},
        services: {
          type: 'array',
          items: strict({
            name: text,
            hasVersion: {type: 'boolean'},
            hasRuntime: {type: 'boolean'},
            isEndOfSupportTracked: {type: 'boolean'},
          }),
        },
      }),
    },
    runtimes: {type: 'array', items: strict({name: text})},
  }),
  HostingInput: input(hostingFields, ['provider', 'service']),
  HostingPatch: input(hostingFields),
  ApiKey: strict({
    id,
    name: text,
    keyPrefix: text,
    scopeLabel: text,
    scopes: {type: 'array', items: {type: 'string', enum: [...API_KEY_SCOPES]}},
    createdAt: timestamp,
    expiresAt: nullable('string', {format: 'date-time'}),
    lastUsedAt: nullable('string', {format: 'date-time'}),
    status: {type: 'string', enum: [...API_KEY_STATUSES]},
    revokedAt: nullable('string', {format: 'date-time'}),
    /** Present only on create; null on an Idempotency-Key replay. Never stored. */
    key: nullable('string'),
  }, ['key', 'revokedAt']),
  ApiKeyInput: input(
    {
      name: {type: 'string', maxLength: API_KEY_NAME_MAX_LENGTH},
      expiresOn: nullable('string', {format: 'date', description: 'YYYY-MM-DD; omit or null for no expiry'}),
    },
    ['name'],
  ),
  MonitoringSource: strict({
    id: text,
    name: text,
    monitors: text,
    status: {type: 'string', enum: [...MONITORING_SOURCE_STATUSES]},
    lastRefreshedAt: nullable('string', {format: 'date-time'}),
    url: text,
  }),
  NoticeMatch: strict({
    id,
    app: personRef,
    component: text,
    version: nullable('string'),
    region: nullable('string'),
    matchReason: {...text, description: 'Why we think this notice concerns the app'},
    confidence: {type: 'string', enum: [...MATCH_CONFIDENCES], description: 'A match the source does not tie to the app is never high'},
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    resolvedAt: {...nullable('string', {format: 'date-time'}), description: 'Set when the app no longer has what matched, or the source stopped reporting it'},
  }),
  Notice: strict({
    id,
    dedupeKey: text,
    category: {type: 'string', enum: [...NOTICE_CATEGORIES]},
    severity: {type: 'string', enum: [...NOTICE_SEVERITIES], description: 'Potential impact; never changed by a status'},
    title: text,
    summary: text,
    source: {type: 'string', enum: [...NOTICE_SOURCES]},
    sourceName: text,
    sourceUrl: nullable('string'),
    externalId: {...nullable('string'), description: 'The source\'s own id, such as an advisory id'},
    origin: {type: 'string', enum: [...NOTICE_ORIGINS], description: 'person: entered by a person; external: an outside source\'s claim'},
    publishedAt: nullable('string', {format: 'date-time'}),
    dueOn: nullable('string', {format: 'date'}),
    firstSeenAt: timestamp,
    lastSeenAt: {...timestamp, description: 'The last time the stored check results still showed it'},
    resolvedUpstreamAt: {...nullable('string', {format: 'date-time'}), description: 'Set when no app is affected any more: the source stopped reporting it, or the apps no longer have what matched'},
    matches: {type: 'array', items: ref('NoticeMatch')},
  }),
};

const appId = pathId('id', 'App id');

const HOSTING_WRITE_NOTE =
  `400 when the provider, service, region or runtime is longer than ${HOSTING_NAME_MAX_LENGTH} characters, or a version longer than ${HOSTING_VERSION_MAX_LENGTH}. ` +
  'The answer is the row as saved; the check runs after the write has committed, never inside its transaction, ' +
  `and takes at most ${MONITORING_FOLLOW_UP_BUDGET_MS / 1000} seconds. A row it does not reach stays unchecked (status na) until the next refresh. ` +
  'Replaying a stored response (same Idempotency-Key) does not check again.';
const body = (name: string) => ({required: true, content: {'application/json': {schema: ref(name)}}});

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'App Register API',
    version: '1.0.0',
    description:
      'Register of bought SaaS and in-house apps. Every request except this document needs ' +
      '`Authorization: Bearer <API key>`; the key decides the workspace. Keys created in Settings ' +
      'are scoped to the applications register (apps, dependencies, hosting); keys from ' +
      '`npm run api-key:create` (including APP_REGISTER_API_KEY) have full access. Expired and ' +
      'revoked keys get 401; a scoped key on an out-of-scope route gets 403. POST and PATCH need an ' +
      '`Idempotency-Key` header (except the refresh endpoints, which are safe to repeat). Dates are YYYY-MM-DD; timestamps are ISO 8601 UTC.',
  },
  servers: [{url: '/'}],
  security: [{bearerAuth: []}],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description:
          'Create a full-access key with `npm run api-key:create -- <name>`, or a scoped applications-register key from Settings / POST /api/api-keys. Optional expiry; only the SHA-256 hash is stored.',
      },
    },
    schemas,
  },
  paths: {
    '/api/apps': {
      get: {
        summary: 'List active (not archived) apps',
        parameters: [
          {name: 'kind', in: 'query', schema: {type: 'string', enum: [...APP_KINDS]}},
          {name: 'sort', in: 'query', schema: {type: 'string', enum: [...APP_SORTS], default: 'name'}},
          {
            name: 'noticeDeadlineWithinDays',
            in: 'query',
            description: 'Only apps whose notice deadline is between today and today + N (inclusive)',
            schema: {type: 'integer', minimum: 0, maximum: NOTICE_WINDOW_MAX_DAYS},
          },
        ],
        responses: {
          200: json(strict({apps: {type: 'array', items: ref('App')}}), 'Apps'),
          400: errors[400],
          401: errors[401],
          403: errors[403],
        },
      },
      post: {
        summary: 'Create an app and schedule its notice alerts',
        parameters: [idempotencyKey],
        requestBody: body('AppInput'),
        responses: {201: json(strict({app: ref('AppDetail')}), 'Created'), ...errors},
      },
    },
    '/api/apps/{id}': {
      get: {
        summary: 'One app (archived too) with alerts, dependencies and hosting',
        parameters: [appId],
        responses: {
          200: json(strict({app: ref('AppDetail')}), 'App'),
          401: errors[401],
          403: errors[403],
          404: errors[404],
        },
      },
      patch: {
        summary: 'Update an active app; a new notice deadline replaces scheduled alerts',
        parameters: [appId, idempotencyKey],
        requestBody: body('AppPatch'),
        responses: {200: json(strict({app: ref('AppDetail')}), 'Updated'), ...errors},
      },
    },
    '/api/apps/{id}/archive': {
      post: {
        summary: 'Archive (soft delete) an app: hides it, frees its name, drops scheduled alerts',
        parameters: [appId, idempotencyKey],
        responses: {200: json(strict({app: ref('AppDetail')}), 'Archived'), ...errors},
      },
    },
    '/api/apps/{id}/dependencies': {
      get: {
        summary: "An app's dependencies",
        parameters: [appId],
        responses: {
          200: json(strict({dependencies: {type: 'array', items: ref('Dependency')}}), 'Dependencies'),
          401: errors[401],
          403: errors[403],
          404: errors[404],
        },
      },
      post: {
        summary: 'Add a dependency (name unique per app, case-insensitive); it is then checked against the registry',
        parameters: [appId, idempotencyKey],
        requestBody: body('DependencyInput'),
        responses: {201: json(strict({dependency: ref('Dependency')}), 'Added'), ...errors},
      },
    },
    '/api/apps/{id}/dependencies/import': {
      post: {
        summary: 'Import direct dependencies from a package.json or package-lock.json, then check them',
        description:
          'The body is the file itself. Runtime, optional and dev dependencies are taken (dev ones flagged `isDev`), ' +
          'each under its real package name (an npm alias is resolved). ' +
          'A lockfile gives exact installed versions; a package.json gives its ranges with the operators stripped. ' +
          `A version that is still a range (\`^16\`, \`4.x\`, \`*\`) cannot be checked for advisories: it gets status attention and costs ${RANGE_VERSION_POINTS} point. ` +
          'By name: new ones are added, known ones get the file\'s version, and ones no longer in the file are ' +
          'removed only if an earlier import created them. Imports of one app run one at a time. ' +
          '400 and nothing changes when: the body is not JSON or not a package file, it is larger than the cap, ' +
          'two entries of one list have the same name after trimming (ignoring case), ' +
          `a name is longer than ${DEPENDENCY_NAME_MAX_LENGTH} characters or a version longer than ${DEPENDENCY_VERSION_MAX_LENGTH}. ` +
          `The check afterwards takes at most ${MONITORING_FOLLOW_UP_BUDGET_MS / 1000} seconds; what it does not reach stays unchecked until the next refresh. ` +
          'A replay (same Idempotency-Key) does not check again.',
        parameters: [appId, idempotencyKey],
        requestBody: body('PackageFile'),
        responses: {200: json(strict({import: ref('DependencyImport')}), 'Imported'), ...errors},
      },
    },
    '/api/apps/{id}/dependencies/refresh': {
      post: {
        summary: "Check an app's dependencies against the npm registry and OSV now",
        description: 'Safe to repeat, so it needs no Idempotency-Key. One package failing never fails the refresh.',
        parameters: [appId],
        responses: {
          200: json(strict({refresh: ref('DependencyRefresh')}), 'Checked'),
          401: errors[401],
          403: errors[403],
          404: errors[404],
        },
      },
    },
    '/api/apps/{id}/dependencies/{dependencyId}': {
      patch: {
        summary: 'Update a dependency; it is then checked again',
        parameters: [appId, pathId('dependencyId', 'Dependency id'), idempotencyKey],
        requestBody: body('DependencyPatch'),
        responses: {200: json(strict({dependency: ref('Dependency')}), 'Updated'), ...errors},
      },
      delete: {
        summary: 'Remove a dependency (a second delete answers 404)',
        parameters: [appId, pathId('dependencyId', 'Dependency id')],
        responses: {204: {description: 'Removed'}, 401: errors[401], 403: errors[403], 404: errors[404]},
      },
    },
    '/api/apps/{id}/hosting': {
      get: {
        summary: 'Where an app runs',
        parameters: [appId],
        responses: {
          200: json(strict({hosting: {type: 'array', items: ref('Hosting')}}), 'Hosting'),
          401: errors[401],
          403: errors[403],
          404: errors[404],
        },
      },
      post: {
        summary: 'Add a hosting entry (one per provider + service + region); it is then checked against the monitoring sources',
        description: HOSTING_WRITE_NOTE,
        parameters: [appId, idempotencyKey],
        requestBody: body('HostingInput'),
        responses: {201: json(strict({hosting: ref('Hosting')}), 'Added'), ...errors},
      },
    },
    '/api/apps/{id}/hosting/refresh': {
      post: {
        summary: "Check an app's hosting now: end-of-support dates and open provider incidents",
        description:
          'Safe to repeat, so it needs no Idempotency-Key. One source failing never fails the check: it is named in ' +
          '`healthError` and what earlier checks found from it is kept. An answer is dropped when the row changed meanwhile.',
        parameters: [appId],
        responses: {
          200: json(strict({hosting: {type: 'array', items: ref('Hosting')}}), 'Checked'),
          401: errors[401],
          403: errors[403],
          404: errors[404],
        },
      },
    },
    '/api/apps/{id}/hosting/{hostingId}': {
      patch: {
        summary: 'Update a hosting entry; it is then checked again',
        description: HOSTING_WRITE_NOTE,
        parameters: [appId, pathId('hostingId', 'Hosting entry id'), idempotencyKey],
        requestBody: body('HostingPatch'),
        responses: {200: json(strict({hosting: ref('Hosting')}), 'Updated'), ...errors},
      },
      delete: {
        summary: 'Remove a hosting entry (a second delete answers 404)',
        parameters: [appId, pathId('hostingId', 'Hosting entry id')],
        responses: {204: {description: 'Removed'}, 401: errors[401], 403: errors[403], 404: errors[404]},
      },
    },
    '/api/hosting/catalog': {
      get: {
        summary: 'Providers, services and runtimes the hosting check knows (anything else is free text, unmonitored)',
        responses: {200: json(strict({catalog: ref('HostingCatalog')}), 'Catalog'), 401: errors[401], 403: errors[403]},
      },
    },
    '/api/monitoring/dependencies/refresh': {
      post: {
        summary: 'Check the dependencies of every active app',
        description: 'Safe to repeat, so it needs no Idempotency-Key.',
        responses: {
          200: json(strict({refresh: ref('WorkspaceDependencyRefresh')}), 'Checked'),
          401: errors[401],
          403: errors[403],
        },
      },
    },
    '/api/monitoring/hosting/refresh': {
      post: {
        summary: 'Check the hosting of every active app',
        description: 'Safe to repeat, so it needs no Idempotency-Key. An app archived while it runs is skipped.',
        responses: {
          200: json(strict({refresh: ref('WorkspaceHostingRefresh')}), 'Checked'),
          401: errors[401],
          403: errors[403],
        },
      },
    },
    '/api/monitoring/refresh': {
      post: {
        summary: 'Run both checks for every active app: dependencies, then hosting (the daily scheduled job calls this)',
        description: 'Safe to repeat, so it needs no Idempotency-Key.',
        responses: {
          200: json(
            strict({
              refresh: strict({dependencies: ref('WorkspaceDependencyRefresh'), hosting: ref('WorkspaceHostingRefresh')}),
            }),
            'Checked',
          ),
          401: errors[401],
          403: errors[403],
        },
      },
    },
    '/api/people': {
      get: {
        summary: 'Active people, by name',
        responses: {
          200: json(strict({people: {type: 'array', items: ref('Person')}}), 'People'),
          401: errors[401],
          403: errors[403],
        },
      },
      post: {
        summary: 'Add a person (email trimmed and lowercased; unique per workspace)',
        parameters: [idempotencyKey],
        requestBody: body('PersonInput'),
        responses: {201: json(strict({person: ref('Person')}), 'Created'), ...errors},
      },
    },
    '/api/people/{id}': {
      patch: {
        summary: 'Rename, re-email, or mark a person as left',
        parameters: [pathId('id', 'Person id'), idempotencyKey],
        requestBody: body('PersonPatch'),
        responses: {200: json(strict({person: ref('Person')}), 'Updated'), ...errors},
      },
    },
    '/api/notice-alerts': {
      get: {
        summary: 'Notice alerts by due date (includes archived apps as history)',
        parameters: [
          {name: 'status', in: 'query', schema: {type: 'string', enum: [...NOTICE_ALERT_STATUSES]}},
          {name: 'appId', in: 'query', schema: id},
        ],
        responses: {
          200: json(strict({alerts: {type: 'array', items: ref('NoticeAlert')}}), 'Alerts'),
          400: errors[400],
          401: errors[401],
          403: errors[403],
        },
      },
    },
    '/api/notice-alerts/{id}/acknowledge': {
      post: {
        summary: 'Mark an alert seen (first time wins; never changes the app)',
        parameters: [pathId('id', 'Alert id'), idempotencyKey],
        responses: {200: json(strict({alert: ref('NoticeAlert')}), 'Acknowledged'), ...errors},
      },
    },
    '/api/api-keys': {
      get: {
        summary: 'List API keys for the workspace (name, prefix, scope, dates, status; never the secret)',
        responses: {
          200: json(strict({apiKeys: {type: 'array', items: ref('ApiKey')}}), 'Keys'),
          401: errors[401],
          403: errors[403],
        },
      },
      post: {
        summary: 'Create a Settings-scoped API key (applications register); the full key is returned once',
        parameters: [idempotencyKey],
        requestBody: body('ApiKeyInput'),
        responses: {201: json(strict({apiKey: ref('ApiKey')}), 'Created'), ...errors},
      },
    },
    '/api/api-keys/{id}/revoke': {
      post: {
        summary: 'Revoke an active API key; later requests with it get 401',
        parameters: [pathId('id', 'API key id'), idempotencyKey],
        responses: {200: json(strict({apiKey: ref('ApiKey')}), 'Revoked'), ...errors},
      },
    },
    '/api/notices': {
      get: {
        summary: 'Notices that concern active apps, most severe first (open ones by default)',
        parameters: [
          {name: 'appId', in: 'query', schema: id},
          {name: 'severity', in: 'query', schema: {type: 'string', enum: [...NOTICE_SEVERITIES]}},
          {name: 'category', in: 'query', schema: {type: 'string', enum: [...NOTICE_CATEGORIES]}},
          {name: 'state', in: 'query', schema: {type: 'string', enum: [...NOTICE_STATES]}},
        ],
        responses: {200: json(strict({notices: {type: 'array', items: ref('Notice')}}), 'Notices'), 400: errors[400], 401: errors[401], 403: errors[403], 500: errors[500]},
      },
    },
    '/api/notices/{id}': {
      get: {
        summary: 'One notice with its source and the active apps it matches',
        parameters: [pathId('id', 'Notice id')],
        responses: {200: json(strict({notice: ref('Notice')}), 'Notice'), 401: errors[401], 403: errors[403], 404: errors[404], 500: errors[500]},
      },
    },
    '/api/settings/monitoring-sources': {
      get: {
        summary: 'Monitoring data sources the app uses (npm, OSV, endoflife.date, provider status feeds)',
        responses: {
          200: json(strict({sources: {type: 'array', items: ref('MonitoringSource')}}), 'Sources'),
          401: errors[401],
          403: errors[403],
        },
      },
    },
    '/api/openapi.json': {
      get: {
        summary: 'This document',
        security: [],
        responses: {200: {description: 'OpenAPI 3.1 document'}},
      },
    },
  },
} as const;
