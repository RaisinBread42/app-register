import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createDb, migrateSchema} from '../src/lib/db/client';

const url = process.env.DATABASE_URL ?? 'file:./data/app-register.db';
if (url.startsWith('file:') && !url.includes(':memory:')) {
  mkdirSync(dirname(url.slice('file:'.length)), {recursive: true});
}

const db = createDb(url);
migrateSchema(db);
console.log(`Migrated schema at ${url}`);
db.$client.close();
