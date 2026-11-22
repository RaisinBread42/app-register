// Create or revoke an API key for the default workspace.
//   npm run api-key:create -- "<name>"      prints the key once; store it in your secret manager
//   npm run api-key:revoke -- <keyPrefix|id> the prefix or id printed at creation, e.g. ar_AbC123
import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/db/schema';
import {createApiKey, revokeApiKey} from '../src/lib/services/api-keys';
import {ensureDefaultWorkspace} from '../src/lib/services/workspaces';

const COMMAND = {create: 'create', revoke: 'revoke'} as const;

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set (see .env.example)');
  }
  if (!argument || (command !== COMMAND.create && command !== COMMAND.revoke)) {
    throw new Error('Usage: api-key.ts create "<name>" | api-key.ts revoke <keyPrefix|id>');
  }
  const client = postgres(url, {max: 1, onnotice: () => {}});
  try {
    const db = drizzle(client, {schema});
    const workspaceId = await ensureDefaultWorkspace(db);
    if (command === COMMAND.create) {
      const created = await createApiKey(db, workspaceId, argument);
      console.log(`API key "${created.name}" (prefix ${created.keyPrefix}, id ${created.id}). Shown once, store it now:`);
      console.log(created.key);
    } else {
      await revokeApiKey(db, workspaceId, argument);
      console.log(`Revoked the active key ${argument}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
