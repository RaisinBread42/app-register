import {
  APP_KINDS,
  APP_SORTS,
  END_OF_SUPPORT_SOURCES,
  HOSTING_HEALTH_STATUSES,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_TTL_HOURS,
  INCIDENT_IMPACTS,
  INCIDENT_SCOPES,
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
  hostingHealth: ref('HostingHealth'),
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
  name: text,
  currentVersion: text,
  latestVersion: nullable('string'),
  vulnerabilities: {type: 'array', items: text, description: 'Advisory ids, e.g. CVE-2026-1234'},
  recommendedAction: nullable('string'),
};

const hostingFields = {
  provider: {...text, examples: ['Azure', 'AWS', 'Vercel']},
  service: {...text, examples: ['SQL Server', 'App Service']},
  region: nullable('string'),
  version: {...nullable('string'), description: 'Version of the service itself, e.g. 16 for a database'},
  runtime: {...nullable('string'), examples: ['Node.js', 'Python', '.NET']},
  runtimeVersion: {...nullable('string'), examples: ['22']},
  endOfSupportOn: {
    ...nullable('string', {format: 'date'}),
    description:
      'Send a date to set it by hand (it is then never overwritten). Send null to let the hosting check ' +
      'look it up on endoflife.date from the service version or the runtime version.',
  },
};

/** What the hosting check stores on a row; read-only. */
const hostingCheckFields = {
  endOfSupportSource: {type: ['string', 'null'], enum: [...END_OF_SUPPORT_SOURCES, null]},
  incidents: {type: 'array', items: ref('HostingIncident')},
  healthCheckedAt: nullable('string', {format: 'date-time'}),
  healthError: {...nullable('string'), description: 'Sources that could not be read on the last check'},
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
  Dependency: strict({id, appId: id, ...dependencyFields, createdAt: timestamp, updatedAt: timestamp}),
  DependencyInput: input(dependencyFields, ['name', 'currentVersion']),
  DependencyPatch: input(dependencyFields),
  Hosting: strict({id, appId: id, ...hostingFields, ...hostingCheckFields, createdAt: timestamp, updatedAt: timestamp}),
  HostingIncident: strict({
    title: text,
    impact: {type: 'string', enum: [...INCIDENT_IMPACTS]},
    scope: {
      type: 'string',
      enum: [...INCIDENT_SCOPES],
      description: 'service: the feed names this service or region. provider: it only names the provider.',
    },
    url: text,
    startedAt: nullable('string', {format: 'date-time'}),
  }),
  HostingHealth: strict({
    status: {type: 'string', enum: [...HOSTING_HEALTH_STATUSES], description: 'na: nothing monitored'},
    deductions: {type: 'array', items: ref('Deduction')},
  }),
  Deduction: strict({
    dimension: text,
    label: text,
    detail: text,
    points: {type: 'integer', maximum: 0, description: 'Points off the 100-point health score'},
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
      '`Idempotency-Key` header. Dates are YYYY-MM-DD; timestamps are ISO 8601 UTC.',
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
        summary: 'Add a dependency (name unique per app, case-insensitive)',
        parameters: [appId, idempotencyKey],
        requestBody: body('DependencyInput'),
        responses: {201: json(strict({dependency: ref('Dependency')}), 'Added'), ...errors},
      },
    },
    '/api/apps/{id}/dependencies/{dependencyId}': {
      patch: {
        summary: 'Update a dependency',
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
        summary: 'Add a hosting entry (one per provider + service + region) and check it against the monitoring sources',
        parameters: [appId, idempotencyKey],
        requestBody: body('HostingInput'),
        responses: {201: json(strict({hosting: ref('Hosting')}), 'Added'), ...errors},
      },
    },
    '/api/apps/{id}/hosting/refresh': {
      post: {
        summary: "Check an app's hosting now: end-of-support dates and open provider incidents",
        parameters: [appId, idempotencyKey],
        responses: {200: json(strict({hosting: {type: 'array', items: ref('Hosting')}}), 'Checked'), ...errors},
      },
    },
    '/api/apps/{id}/hosting/{hostingId}': {
      patch: {
        summary: 'Update a hosting entry and check it again',
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
    '/api/hosting/catalog': {
      get: {
        summary: 'Providers, services and runtimes the hosting check knows (anything else is free text, unmonitored)',
        responses: {200: json(strict({catalog: ref('HostingCatalog')}), 'Catalog'), 401: errors[401]},
      },
    },
    '/api/monitoring/hosting/refresh': {
      post: {
        summary: 'Check the hosting of every active app in the workspace (for a daily job)',
        parameters: [idempotencyKey],
        responses: {
          200: json(
            strict({
              refreshed: strict({
                apps: {type: 'integer'},
                hosting: {type: 'integer'},
                failedSources: {type: 'array', items: text},
              }),
            }),
            'Checked',
          ),
          ...errors,
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
