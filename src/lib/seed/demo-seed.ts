import {and, eq, inArray, isNotNull, isNull, notInArray, or} from 'drizzle-orm';
import {
  ADVISORY_SEVERITY,
  ADVISORY_SOURCE,
  APP_CRITICALITY,
  APP_ENVIRONMENT,
  APP_KIND,
  INCIDENT_IMPACT,
  INCIDENT_SCOPE,
  PERSON_STATUS,
  type AdvisorySeverity,
  type AppCriticality,
  type AppEnvironment,
  type AppKind,
} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {appDependencies, appHosting, apps, people} from '@/lib/db/schema';
import {addDaysIso, todayIso} from '@/lib/notice-alerts';
import {createApp} from '@/lib/services/apps';
import {addDependency} from '@/lib/services/dependencies';
import {replaceAdvisories} from '@/lib/services/dependency-advisories';
import {ValidationError} from '@/lib/services/errors';
import {addHosting} from '@/lib/services/hosting';
import {replaceIncidents} from '@/lib/services/hosting-incidents';
import {createPerson, updatePerson} from '@/lib/services/people';

/**
 * Fictional demo data for local runs and end-to-end tests. Every name is made
 * up, emails use the reserved `example.test` domain, and advisory ids start with
 * DEMO- so they can't be mistaken for real ones. Seeding is additive and
 * idempotent, and it refuses a workspace that holds any app it didn't create,
 * so it can never mix into real data (UAT holds real data).
 */

type SeedPerson = {key: string; name: string; email: string};
type SeedAdvisory = {id: string; severity: AdvisorySeverity; summary: string};
type SeedDependency = {name: string; currentVersion: string; latestVersion: string; advisories: SeedAdvisory[]};
type SeedHosting = {
  provider: string;
  service: string;
  region: string | null;
  runtime: string | null;
  runtimeVersion: string | null;
  endOfSupportOn: string | null;
  incident: {title: string; startedDaysAgo: number} | null;
};
type SeedApp = {
  name: string;
  kind: AppKind;
  criticality: AppCriticality | null;
  environments: AppEnvironment[];
  category: string;
  vendor: string | null;
  owner: string;
  backup: string;
  renewalInDays: number | null;
  noticeInDays: number | null;
  runtime: {location: string; dataAndKeys: string; whatBreaks: string} | null;
  dependencies: SeedDependency[];
  hosting: SeedHosting[];
};

/** Keys the demo apps use to name their owner and backup. */
const PERSON = {avery: 'avery', jordan: 'jordan', sam: 'sam', riley: 'riley', casey: 'casey'} as const;
const FINANCE = 'Finance';
const VERCEL = 'Vercel';
const NEXT_VERSION = '16.4.6';

export const DEMO_PEOPLE: SeedPerson[] = [
  {key: PERSON.avery, name: 'Avery Quinn', email: 'avery.quinn@example.test'},
  {key: PERSON.jordan, name: 'Jordan Blake', email: 'jordan.blake@example.test'},
  {key: PERSON.sam, name: 'Sam Rivera', email: 'sam.rivera@example.test'},
  {key: PERSON.riley, name: 'Riley Chen', email: 'riley.chen@example.test'},
  {key: PERSON.casey, name: 'Casey Morgan', email: 'casey.morgan@example.test'},
];

/** Owns apps, then leaves: the leaver case. */
export const DEMO_LEAVER_KEY = PERSON.casey;

const NODE_18_END_OF_SUPPORT = '2025-04-30';

export const DEMO_APPS: SeedApp[] = [
  {
    name: 'Ledgerline', criticality: APP_CRITICALITY.high, environments: [], kind: APP_KIND.saas, category: FINANCE, vendor: 'Ledgerline Ltd', owner: PERSON.avery, backup: PERSON.jordan,
    renewalInDays: 55, noticeInDays: 25, runtime: null, dependencies: [], hosting: [],
  },
  {
    name: 'Brightdesk', criticality: APP_CRITICALITY.medium, environments: [], kind: APP_KIND.saas, category: 'Support', vendor: 'Brightdesk Inc', owner: PERSON.jordan, backup: PERSON.sam,
    renewalInDays: 120, noticeInDays: 55, runtime: null, dependencies: [], hosting: [],
  },
  {
    name: 'Inkpad CRM', criticality: APP_CRITICALITY.medium, environments: [], kind: APP_KIND.saas, category: 'Sales', vendor: 'Inkpad Software', owner: PERSON.casey, backup: PERSON.avery,
    renewalInDays: 115, noticeInDays: 85, runtime: null, dependencies: [], hosting: [],
  },
  {
    name: 'Northwind Portal', criticality: APP_CRITICALITY.critical, environments: [APP_ENVIRONMENT.production, APP_ENVIRONMENT.staging], kind: APP_KIND.inHouse, category: 'Customer portal', vendor: null, owner: PERSON.sam, backup: PERSON.riley,
    renewalInDays: null, noticeInDays: null,
    runtime: {location: 'Azure App Service, UK South', dataAndKeys: 'Customer accounts; payment provider API key', whatBreaks: 'Customers cannot log in or pay invoices'},
    dependencies: [
      {name: 'express', currentVersion: '4.17.1', latestVersion: '4.21.2', advisories: [
        {id: 'DEMO-2026-0001', severity: ADVISORY_SEVERITY.critical, summary: 'Demo advisory: request smuggling in the router'},
      ]},
      {name: 'react', currentVersion: '18.2.0', latestVersion: '19.3.1', advisories: []},
    ],
    hosting: [{
      provider: 'Azure', service: 'App Service', region: 'uksouth', runtime: 'Node.js', runtimeVersion: '18',
      endOfSupportOn: NODE_18_END_OF_SUPPORT, incident: {title: 'Demo: degraded performance for App Service in UK South', startedDaysAgo: 1},
    }],
  },
  {
    name: 'Fleet Tracker', criticality: APP_CRITICALITY.low, environments: [APP_ENVIRONMENT.production], kind: APP_KIND.citizenBuilt, category: 'Operations', vendor: null, owner: PERSON.riley, backup: PERSON.casey,
    renewalInDays: null, noticeInDays: null,
    runtime: {location: 'Shared spreadsheet plus a scheduled script on the office server', dataAndKeys: 'Vehicle bookings; mapping API key', whatBreaks: 'Drivers lose the weekly rota'},
    dependencies: [
      {name: 'lodash', currentVersion: '4.17.20', latestVersion: '4.17.21', advisories: [
        {id: 'DEMO-2026-0002', severity: ADVISORY_SEVERITY.high, summary: 'Demo advisory: prototype pollution in a merge helper'},
      ]},
    ],
    hosting: [],
  },
  {
    name: 'Staff Directory', criticality: APP_CRITICALITY.low, environments: [APP_ENVIRONMENT.production], kind: APP_KIND.inHouse, category: 'People', vendor: null, owner: PERSON.avery, backup: PERSON.sam,
    renewalInDays: null, noticeInDays: null,
    runtime: {location: VERCEL, dataAndKeys: 'Staff names and desk numbers', whatBreaks: 'Reception cannot find people'},
    dependencies: [{name: 'next', currentVersion: NEXT_VERSION, latestVersion: NEXT_VERSION, advisories: []}],
    hosting: [{provider: VERCEL, service: 'Hosting', region: null, runtime: null, runtimeVersion: null, endOfSupportOn: null, incident: null}],
  },
  {
    name: 'Payroll Bridge', criticality: APP_CRITICALITY.high, environments: [], kind: APP_KIND.vendorService, category: FINANCE, vendor: 'Bridgeworks Payroll', owner: PERSON.casey, backup: PERSON.jordan,
    renewalInDays: 200, noticeInDays: 140, runtime: null, dependencies: [], hosting: [],
  },
  {
    name: 'Room Booker', criticality: null, environments: [], kind: APP_KIND.saas, category: 'Facilities', vendor: 'Roomly', owner: PERSON.sam, backup: PERSON.avery,
    renewalInDays: null, noticeInDays: null, runtime: null, dependencies: [], hosting: [],
  },
];

export const DEMO_APP_NAMES = DEMO_APPS.map((app) => app.name);

export type SeedResult = {peopleCreated: number; appsCreated: number; appsSkipped: number};

/**
 * Loads the demo data into `workspaceId`, all in one transaction: an interrupted
 * run leaves nothing behind. Safe to run again: it only adds what is missing.
 */
export async function seedDemoData(db: AppDatabase, workspaceId: string, today = todayIso()): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    await assertOnlyDemoData(tx, workspaceId);
    const {ids, created} = await ensurePeople(tx, workspaceId);
    const existing = await existingAppNames(tx, workspaceId);
    let appsCreated = 0;
    for (const app of DEMO_APPS) {
      if (existing.has(app.name.toLowerCase())) {
        continue;
      }
      await createDemoApp(tx, workspaceId, app, ids, today);
      appsCreated += 1;
    }
    await markLeaver(tx, workspaceId, ids, today);
    return {peopleCreated: created, appsCreated, appsSkipped: DEMO_APPS.length - appsCreated};
  });
}

/**
 * Real data is a person without a demo email, or an app (archived or not) owned or backed up
 * by someone who is not a demo person. Apps owned by demo people (example.test, a reserved
 * domain) are test data, so an e2e run can seed a database earlier runs added apps to.
 * A real app that happens to share a demo app's name is still refused: its owner is real.
 */
async function assertOnlyDemoData(db: AppDatabase, workspaceId: string): Promise<void> {
  const demoEmails = DEMO_PEOPLE.map((person) => person.email);
  const realPeople = await db
    .select({id: people.id})
    .from(people)
    .where(and(eq(people.workspaceId, workspaceId), notInArray(people.email, demoEmails)))
    .limit(1);
  const demoIds = db.select({id: people.id}).from(people).where(and(eq(people.workspaceId, workspaceId), inArray(people.email, demoEmails)));
  const realApps = await db
    .select({id: apps.id})
    .from(apps)
    .where(
      and(
        eq(apps.workspaceId, workspaceId),
        or(notInArray(apps.ownerId, demoIds), and(isNotNull(apps.backupOwnerId), notInArray(apps.backupOwnerId, demoIds))),
      ),
    )
    .limit(1);
  if (realPeople.length > 0 || realApps.length > 0) {
    throw new ValidationError('This workspace holds people or apps that are not demo data, so the seed will not touch it.');
  }
}

async function ensurePeople(db: AppDatabase, workspaceId: string): Promise<{ids: Map<string, string>; created: number}> {
  const emails = DEMO_PEOPLE.map((person) => person.email);
  const rows = await db
    .select({id: people.id, email: people.email})
    .from(people)
    .where(and(eq(people.workspaceId, workspaceId), inArray(people.email, emails)));
  const byEmail = new Map(rows.map((row) => [row.email, row.id]));
  const ids = new Map<string, string>();
  let created = 0;
  for (const person of DEMO_PEOPLE) {
    let personId = byEmail.get(person.email);
    if (!personId) {
      personId = (await createPerson(db, workspaceId, {name: person.name, email: person.email})).id;
      created += 1;
    }
    ids.set(person.key, personId);
  }
  return {ids, created};
}

async function existingAppNames(db: AppDatabase, workspaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({name: apps.name})
    .from(apps)
    .where(and(eq(apps.workspaceId, workspaceId), isNull(apps.archivedAt)));
  return new Set(rows.map((row) => row.name.toLowerCase()));
}

async function createDemoApp(
  db: AppDatabase,
  workspaceId: string,
  app: SeedApp,
  ids: Map<string, string>,
  today: string,
): Promise<void> {
  // The leaver must be active while one of their apps is created; markLeaver sets them back to left.
  const leaverId = personId(ids, DEMO_LEAVER_KEY);
  if (app.owner === DEMO_LEAVER_KEY || app.backup === DEMO_LEAVER_KEY) {
    await updatePerson(db, workspaceId, leaverId, {status: PERSON_STATUS.active, leftOn: null});
  }
  const created = await createApp(
    db,
    workspaceId,
    {
      name: app.name,
      kind: app.kind,
      criticality: app.criticality,
      environments: app.environments,
      category: app.category,
      vendor: app.vendor,
      ownerId: personId(ids, app.owner),
      backupOwnerId: personId(ids, app.backup),
      renewalDate: app.renewalInDays === null ? null : addDaysIso(today, app.renewalInDays),
      noticeDeadline: app.noticeInDays === null ? null : addDaysIso(today, app.noticeInDays),
      runtimeLocation: app.runtime?.location ?? null,
      dataAndKeys: app.runtime?.dataAndKeys ?? null,
      whatBreaksIfStopped: app.runtime?.whatBreaks ?? null,
    },
    today,
  );
  for (const dependency of app.dependencies) {
    await addCheckedDependency(db, workspaceId, created.id, dependency);
  }
  for (const hosting of app.hosting) {
    await addCheckedHosting(db, workspaceId, created.id, hosting);
  }
}

/** A dependency as if the check had already run: latest version and advisories stored. */
async function addCheckedDependency(db: AppDatabase, workspaceId: string, appId: string, seed: SeedDependency): Promise<void> {
  const row = await addDependency(db, workspaceId, appId, {name: seed.name, currentVersion: seed.currentVersion});
  await db.transaction(async (tx) => {
    await tx
      .update(appDependencies)
      .set({latestVersion: seed.latestVersion, checkedAt: new Date(), checkError: null})
      .where(eq(appDependencies.id, row.id));
    await replaceAdvisories(
      tx,
      {id: row.id, workspaceId},
      ADVISORY_SOURCE.osv,
      seed.advisories.map((advisory) => ({...advisory, aliases: []})),
    );
  });
}

/** A hosting row as if the check had already run: checked time and incidents stored. */
async function addCheckedHosting(db: AppDatabase, workspaceId: string, appId: string, seed: SeedHosting): Promise<void> {
  const {incident, ...input} = seed;
  const row = await addHosting(db, workspaceId, appId, input);
  await db.transaction(async (tx) => {
    await tx.update(appHosting).set({healthCheckedAt: new Date(), healthError: null}).where(eq(appHosting.id, row.id));
    if (incident) {
      const startedAt = new Date(Date.now() - incident.startedDaysAgo * 86_400_000).toISOString();
      await replaceIncidents(tx, {id: row.id, workspaceId}, [
        {title: incident.title, impact: INCIDENT_IMPACT.minor, scope: INCIDENT_SCOPE.service, url: null, startedAt},
      ]);
    }
  });
}

/** The leaver leaves once; a later run leaves their date alone. */
async function markLeaver(db: AppDatabase, workspaceId: string, ids: Map<string, string>, today: string): Promise<void> {
  const leaverId = personId(ids, DEMO_LEAVER_KEY);
  const [leaver] = await db.select({status: people.status}).from(people).where(eq(people.id, leaverId));
  if (leaver?.status !== PERSON_STATUS.left) {
    await updatePerson(db, workspaceId, leaverId, {status: PERSON_STATUS.left, leftOn: today});
  }
}

function personId(ids: Map<string, string>, key: string): string {
  const id = ids.get(key);
  if (!id) {
    throw new Error(`Seed data names an unknown person: ${key}`);
  }
  return id;
}
