import {
  ADVISORY_ID_MAX_LENGTH,
  ADVISORY_SEVERITIES,
  BYTES_PER_MB,
  APP_KINDS,
  APP_SORTS,
  DEPENDENCY_CHECK_ERRORS,
  DEPENDENCY_FOLLOW_UP_BUDGET_MS,
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
  NOTICE_ALERT_STATUSES,
  NOTICE_WINDOW_MAX_DAYS,
  PERSON_STATUSES,
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
  401: json(ref('Error'), 'Missing, unknown or revoked API key'),
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
    `Repeating a request with the same key and the same body replays the first response ` +
    `for ${IDEMPOTENCY_KEY_TTL_HOURS} hours instead of running it again.`,
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
};

const personRef = strict({id, name: text});

const appProperties = {
  id,
  ...appFields,
  owner: personRef,
  backupOwner: personRef,
  health: ref('Health'),
  archivedAt: nullable('string', {format: 'date-time'}),
  createdAt: timestamp,
  updatedAt: timestamp,
};

const appInputFields = {
  ...appFields,
  ownerId: {...id, description: 'Must be an active person when newly assigned'},
  backupOwnerId: {...id, description: 'Must differ from ownerId'},
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
  provider: {...text, examples: ['Azure', 'AWS', 'Vercel']},
  service: {...text, examples: ['SQL Server', 'App Service']},
  region: nullable('string'),
  version: nullable('string'),
  endOfSupportOn: nullable('string', {format: 'date'}),
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
  AppInput: input(appInputFields, ['name', 'kind', 'ownerId', 'backupOwnerId']),
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
    status: {...healthStatus, description: 'na: the app records nothing for this dimension, or none of it has been checked yet'},
    deductions: {type: 'array', items: ref('Deduction'), description: 'Largest first'},
  }),
  Health: {
    ...strict({
      score: {
        ...nullable('integer', {minimum: 0, maximum: HEALTH_MAX_SCORE}),
        description: 'null when no monitored dimension has anything checked: no dependencies, or none of them checked yet',
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
      `Only \`${HEALTH_DIMENSION.dependencies}\` is monitored so far.`,
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
  Hosting: strict({id, appId: id, ...hostingFields, createdAt: timestamp, updatedAt: timestamp}),
  HostingInput: input(hostingFields, ['provider', 'service']),
  HostingPatch: input(hostingFields),
};

const appId = pathId('id', 'App id');
const body = (name: string) => ({required: true, content: {'application/json': {schema: ref(name)}}});

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'App Register API',
    version: '1.0.0',
    description:
      'Register of bought SaaS and in-house apps. Every request except this document needs ' +
      '`Authorization: Bearer <API key>`; the key decides the workspace. POST and PATCH need an ' +
      '`Idempotency-Key` header (except the refresh endpoints, which are safe to repeat). Dates are YYYY-MM-DD; timestamps are ISO 8601 UTC.',
  },
  servers: [{url: '/'}],
  security: [{bearerAuth: []}],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Create one with `npm run api-key:create -- <name>`',
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
          `The check afterwards takes at most ${DEPENDENCY_FOLLOW_UP_BUDGET_MS / 1000} seconds; what it does not reach stays unchecked until the next refresh. ` +
          'Replaying a stored response (same Idempotency-Key) does not check again.',
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
        responses: {204: {description: 'Removed'}, 401: errors[401], 404: errors[404]},
      },
    },
    '/api/apps/{id}/hosting': {
      get: {
        summary: 'Where an app runs',
        parameters: [appId],
        responses: {
          200: json(strict({hosting: {type: 'array', items: ref('Hosting')}}), 'Hosting'),
          401: errors[401],
          404: errors[404],
        },
      },
      post: {
        summary: 'Add a hosting entry (one per provider + service + region)',
        parameters: [appId, idempotencyKey],
        requestBody: body('HostingInput'),
        responses: {201: json(strict({hosting: ref('Hosting')}), 'Added'), ...errors},
      },
    },
    '/api/apps/{id}/hosting/{hostingId}': {
      patch: {
        summary: 'Update a hosting entry',
        parameters: [appId, pathId('hostingId', 'Hosting entry id'), idempotencyKey],
        requestBody: body('HostingPatch'),
        responses: {200: json(strict({hosting: ref('Hosting')}), 'Updated'), ...errors},
      },
      delete: {
        summary: 'Remove a hosting entry (a second delete answers 404)',
        parameters: [appId, pathId('hostingId', 'Hosting entry id')],
        responses: {204: {description: 'Removed'}, 401: errors[401], 404: errors[404]},
      },
    },
    '/api/monitoring/dependencies/refresh': {
      post: {
        summary: 'Check the dependencies of every active app (the daily scheduled job calls this)',
        description: 'Safe to repeat, so it needs no Idempotency-Key.',
        responses: {
          200: json(strict({refresh: ref('WorkspaceDependencyRefresh')}), 'Checked'),
          401: errors[401],
        },
      },
    },
    '/api/people': {
      get: {
        summary: 'Active people, by name',
        responses: {
          200: json(strict({people: {type: 'array', items: ref('Person')}}), 'People'),
          401: errors[401],
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
    '/api/openapi.json': {
      get: {
        summary: 'This document',
        security: [],
        responses: {200: {description: 'OpenAPI 3.1 document'}},
      },
    },
  },
} as const;
