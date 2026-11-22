import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import {MIGRATIONS_FOLDER} from '../src/lib/db/client';
import * as schema from '../src/lib/db/schema';
import {ensureDefaultWorkspace} from '../src/lib/services/workspaces';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (see .env.example)');
  process.exit(1);
}

async function main(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, {max: 1, onnotice: () => {}});
  try {
    const db = drizzle(client, {schema});
    await migrate(db, {migrationsFolder: MIGRATIONS_FOLDER});
    await ensureDefaultWorkspace(db);
    console.log('Migrations applied; default workspace present');
  } finally {
    await client.end();
  }
}

main(url).catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
