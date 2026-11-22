import {drizzle} from 'drizzle-orm/postgres-js';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

/** Any Drizzle Postgres database: postgres.js in the app, PGlite in unit tests. */
export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = 'drizzle';

export function createDb(databaseUrl: string): AppDatabase {
  return drizzle(postgres(databaseUrl), {schema});
}

const cache = globalThis as typeof globalThis & {appDb?: AppDatabase};

/** One shared connection pool per server process (survives dev hot reload). */
export function getDb(): AppDatabase {
  if (!cache.appDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    cache.appDb = createDb(url);
  }
  return cache.appDb;
}
