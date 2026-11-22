import {and, asc, eq, inArray} from 'drizzle-orm';
import {PERSON_STATUS} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {newId} from '@/lib/db/ids';
import {people, type PersonRow} from '@/lib/db/schema';
import {isUniqueViolation, ValidationError} from './errors';

export type CreatePersonInput = {name: string; email: string};

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
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!name) {
    throw new ValidationError('Name is required');
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError('A valid email is required');
  }

  try {
    const [row] = await db
      .insert(people)
      .values({id: newId(), workspaceId, name, email})
      .returning();
    return toPersonView(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError('A person with this email already exists');
    }
    throw error;
  }
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
