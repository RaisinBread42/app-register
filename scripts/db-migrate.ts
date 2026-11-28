import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import {MIGRATIONS_FOLDER} from '../src/lib/db/client';
import * as schema from '../src/lib/db/schema';
import {hasNoNotices, syncWorkspaceNotices} from '../src/lib/services/notices';
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
    // First-deploy backfill: notices derived from what the checks already stored (additive only).
    // Runs only for a workspace with no notices yet, so a restart never bumps last-seen times,
    // and never stops start-up: a failure is logged and the next check fills the gap.
    for (const workspace of await db.select({id: schema.workspaces.id}).from(schema.workspaces)) {
      try {
        if (await hasNoNotices(db, workspace.id)) {
          await syncWorkspaceNotices(db, workspace.id);
        }
      } catch (error) {
        console.error('Notice backfill skipped', {name: (error as Error | undefined)?.name});
      }
    }
    console.log('Migrations applied; default workspace present');
  } finally {
    await client.end();
  }
}

main(url).catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
