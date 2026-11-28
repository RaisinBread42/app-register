// Load the fictional demo data into the default workspace (local and e2e only).
//   npm run db:seed
// It refuses a workspace that already holds apps it did not create, so it never mixes into real data.
import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/db/schema';
import {seedDemoData} from '../src/lib/seed/demo-seed';
import {ensureDefaultWorkspace} from '../src/lib/services/workspaces';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set (see .env.example)');
  }
  const client = postgres(url, {max: 1, onnotice: () => {}});
  try {
    const db = drizzle(client, {schema});
    const workspaceId = await ensureDefaultWorkspace(db);
    const result = await seedDemoData(db, workspaceId);
    console.log(`Seeded demo data: ${result.peopleCreated} people and ${result.appsCreated} apps added, ${result.appsSkipped} apps already there.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
