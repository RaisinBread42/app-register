import {and, asc, eq, inArray} from 'drizzle-orm';
import {PERSON_STATUS, PERSON_STATUSES} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {isUuid, newId} from '@/lib/db/ids';
import {people, type PersonRow} from '@/lib/db/schema';
import {isUniqueViolation, NotFoundError, ValidationError} from './errors';
import {optionalDate, requiredText} from './validation';

export type CreatePersonInput = {name: string; email: string};

/** `status: 'left'` needs `leftOn`; going back to `active` clears it. */
export type UpdatePersonInput = Partial<CreatePersonInput> & {
  status?: string;
  leftOn?: string | null;
};

/** JSON shape of a person in the API. */
export type PersonView = {
  id: string;
  name: string;
  email: string;
  status: string;
  leftOn: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createPerson(
  db: AppDatabase,
  workspaceId: string,
  input: CreatePersonInput,
): Promise<PersonView> {
  const values = validateNameAndEmail(input);
  return withEmailCheck(async () => {
    const [row] = await db
      .insert(people)
      .values({id: newId(), workspaceId, ...values})
      .returning();
    return toPersonView(row);
  });
}

/** Renames, re-emails or marks a person as left (or back to active). */
export async function updatePerson(
  db: AppDatabase,
  workspaceId: string,
  id: string,
  patch: UpdatePersonInput,
): Promise<PersonView> {
  const current = await findPerson(db, workspaceId, id);
  const merged = {...current, ...patch};
  const values = {...validateNameAndEmail(merged), ...validateStatus(merged.status, merged.leftOn)};
  return withEmailCheck(async () => {
    const [row] = await db.update(people).set(values).where(eq(people.id, id)).returning();
    return toPersonView(row);
  });
}

/** One person, active or left. 404 outside the workspace. */
export async function getPerson(db: AppDatabase, workspaceId: string, id: string): Promise<PersonView> {
  return toPersonView(await findPerson(db, workspaceId, id));
}

async function findPerson(db: AppDatabase, workspaceId: string, id: string): Promise<PersonRow> {
  const [row] = isUuid(id)
    ? await db
        .select()
        .from(people)
        .where(and(eq(people.workspaceId, workspaceId), eq(people.id, id)))
    : [];
  if (!row) {
    throw new NotFoundError('Person not found');
  }
  return row;
}

export async function listActivePeople(
  db: AppDatabase,
  workspaceId: string,
): Promise<PersonView[]> {
  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.workspaceId, workspaceId), eq(people.status, PERSON_STATUS.active)))
    .orderBy(asc(people.name));
  return rows.map(toPersonView);
}

/** Owners and backup owners must be active people in the same workspace. */
export async function assertActivePeople(
  db: AppDatabase,
  workspaceId: string,
  personIds: string[],
): Promise<void> {
  const rows = await db
    .select({id: people.id})
    .from(people)
    .where(
      and(
        eq(people.workspaceId, workspaceId),
        eq(people.status, PERSON_STATUS.active),
        inArray(people.id, personIds),
      ),
    );
  if (rows.length !== new Set(personIds).size) {
    throw new ValidationError('Owner and backup owner must be active people in this workspace');
  }
}

function validateNameAndEmail(input: {name?: unknown; email?: unknown}) {
  const name = requiredText(input.name, 'name');
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError('A valid email is required');
  }
  return {name, email};
}

function validateStatus(status: unknown, leftOn: unknown) {
  if (!(PERSON_STATUSES as readonly unknown[]).includes(status)) {
    throw new ValidationError('Status must be active or left');
  }
  if (status === PERSON_STATUS.active) {
    return {status: PERSON_STATUS.active, leftOn: null};
  }
  const date = optionalDate(leftOn, 'left on date');
  if (!date) {
    throw new ValidationError('A person who has left needs a leftOn date');
  }
  return {status: PERSON_STATUS.left, leftOn: date};
}

/** Emails are unique per workspace; the message never repeats the email. */
async function withEmailCheck<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError('A person with this email already exists');
    }
    throw error;
  }
}

function toPersonView(row: PersonRow): PersonView {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    leftOn: row.leftOn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
