import {eq} from 'drizzle-orm';
import {APP_KINDS, type AppKind} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {apps, people, type AppRow} from '@/lib/db/schema';

const IN_HOUSE_KINDS: readonly AppKind[] = ['in_house', 'citizen_built'];

export type CreateAppInput = {
  name: string;
  kind: string;
  ownerId: string;
  backupOwnerId: string;
  renewalDate?: string | null;
  noticeDeadline?: string | null;
  billingCycle?: string | null;
  costCents?: number | null;
  runtimeLocation?: string | null;
  dataAndKeys?: string | null;
  whatBreaksIfStopped?: string | null;
};

export type CreatePersonInput = {
  name: string;
  email: string;
};

export class AppValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppValidationError';
  }
}

export async function createPerson(
  db: AppDatabase,
  input: CreatePersonInput,
): Promise<{id: string; name: string; email: string}> {
  const id = crypto.randomUUID();
  await db.insert(people).values({
    id,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
  });
  return {id, name: input.name.trim(), email: input.email.trim().toLowerCase()};
}

export async function createApp(
  db: AppDatabase,
  input: CreateAppInput,
): Promise<AppRow> {
  const validated = validateCreateAppInput(input);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.insert(apps).values({
    id,
    ...validated,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db.select().from(apps).where(eq(apps.id, id));
  if (!row) {
    throw new Error('Failed to read back created app');
  }
  return row;
}

export async function getAppById(
  db: AppDatabase,
  id: string,
): Promise<AppRow | null> {
  const [row] = await db.select().from(apps).where(eq(apps.id, id));
  return row ?? null;
}

export async function listApps(db: AppDatabase): Promise<AppRow[]> {
  return db.select().from(apps);
}

export function validateCreateAppInput(input: CreateAppInput): {
  name: string;
  kind: AppKind;
  ownerId: string;
  backupOwnerId: string;
  renewalDate: string | null;
  noticeDeadline: string | null;
  billingCycle: string | null;
  costCents: number | null;
  runtimeLocation: string | null;
  dataAndKeys: string | null;
  whatBreaksIfStopped: string | null;
} {
  const name = input.name?.trim() ?? '';
  if (!name) {
    throw new AppValidationError('App name is required');
  }

  if (!isAppKind(input.kind)) {
    throw new AppValidationError(`Unknown app kind: ${input.kind}`);
  }
  const kind = input.kind;

  const ownerId = input.ownerId?.trim() ?? '';
  const backupOwnerId = input.backupOwnerId?.trim() ?? '';
  if (!ownerId || !backupOwnerId) {
    throw new AppValidationError('Owner and backup owner are required');
  }
  if (ownerId === backupOwnerId) {
    throw new AppValidationError('Owner and backup owner must be different people');
  }

  const renewalDate = normalizeOptionalDate(input.renewalDate, 'renewal date');
  const noticeDeadline = normalizeOptionalDate(
    input.noticeDeadline,
    'notice deadline',
  );

  if (
    renewalDate &&
    noticeDeadline &&
    noticeDeadline > renewalDate
  ) {
    throw new AppValidationError(
      'Notice deadline must be on or before the renewal date',
    );
  }

  const runtimeLocation = emptyToNull(input.runtimeLocation);
  const dataAndKeys = emptyToNull(input.dataAndKeys);
  const whatBreaksIfStopped = emptyToNull(input.whatBreaksIfStopped);

  if (IN_HOUSE_KINDS.includes(kind)) {
    if (!runtimeLocation || !dataAndKeys || !whatBreaksIfStopped) {
      throw new AppValidationError(
        'In-house apps require where it runs, data and keys touched, and what breaks if it stops',
      );
    }
  }

  return {
    name,
    kind,
    ownerId,
    backupOwnerId,
    renewalDate,
    noticeDeadline,
    billingCycle: emptyToNull(input.billingCycle),
    costCents:
      input.costCents === undefined || input.costCents === null
        ? null
        : input.costCents,
    runtimeLocation,
    dataAndKeys,
    whatBreaksIfStopped,
  };
}

function isAppKind(value: string): value is AppKind {
  return (APP_KINDS as readonly string[]).includes(value);
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeOptionalDate(
  value: string | null | undefined,
  label: string,
): string | null {
  const normalized = emptyToNull(value);
  if (!normalized) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new AppValidationError(`Invalid ${label}: ${normalized}`);
  }
  return normalized;
}
