import {eq} from 'drizzle-orm';
import {DEFAULT_WORKSPACE_NAME, DEFAULT_WORKSPACE_SLUG} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {newId} from '@/lib/db/ids';
import {workspaces} from '@/lib/db/schema';

/** Creates the default workspace if missing and returns its id. Safe to run repeatedly. */
export async function ensureDefaultWorkspace(db: AppDatabase): Promise<string> {
  await db
    .insert(workspaces)
    .values({id: newId(), name: DEFAULT_WORKSPACE_NAME, slug: DEFAULT_WORKSPACE_SLUG})
    .onConflictDoNothing({target: workspaces.slug});
  return (await findDefaultWorkspaceId(db)) as string;
}

/** The workspace a request acts on. Until sign-in exists this is always the default one. */
export async function getCurrentWorkspaceId(db: AppDatabase): Promise<string> {
  return (await findDefaultWorkspaceId(db)) ?? ensureDefaultWorkspace(db);
}

async function findDefaultWorkspaceId(db: AppDatabase): Promise<string | undefined> {
  const [row] = await db
    .select({id: workspaces.id})
    .from(workspaces)
    .where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG));
  return row?.id;
}
