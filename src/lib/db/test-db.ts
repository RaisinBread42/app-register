import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {ensureDefaultWorkspace} from '@/lib/services/workspaces';
import {MIGRATIONS_FOLDER, type AppDatabase} from './client';
import * as schema from './schema';

export type TestDb = {db: AppDatabase; client: PGlite; workspaceId: string};

/** A fresh in-memory Postgres (PGlite) built by running the real migrations. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, {schema});
  await migrate(db, {migrationsFolder: MIGRATIONS_FOLDER});
  const workspaceId = await ensureDefaultWorkspace(db);
  return {db, client, workspaceId};
}
