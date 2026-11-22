import Database from 'better-sqlite3';
import {drizzle, type BetterSQLite3Database} from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type AppDatabase = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

export function createDb(databaseUrl = process.env.DATABASE_URL): AppDatabase {
  const path = resolveSqlitePath(databaseUrl);
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  if (path !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }
  const db = drizzle(sqlite, {schema}) as AppDatabase;
  db.$client = sqlite;
  return db;
}

export function migrateSchema(db: AppDatabase): void {
  db.$client.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES people(id),
      backup_owner_id TEXT NOT NULL REFERENCES people(id),
      renewal_date TEXT,
      notice_deadline TEXT,
      billing_cycle TEXT,
      cost_cents INTEGER,
      runtime_location TEXT,
      data_and_keys TEXT,
      what_breaks_if_stopped TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function resolveSqlitePath(databaseUrl: string | undefined): string {
  if (!databaseUrl || databaseUrl === ':memory:') {
    return ':memory:';
  }
  if (databaseUrl.startsWith('file:')) {
    return databaseUrl.slice('file:'.length);
  }
  return databaseUrl;
}
