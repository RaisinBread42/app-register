import type {AppDatabase} from '@/lib/db/client';
import {refreshWorkspaceDependencyHealth, type RefreshSummary as DependencyRefreshSummary} from './dependency-health';
import {refreshWorkspaceHostingHealth, type RefreshOptions, type RefreshSummary as HostingRefreshSummary} from './hosting-monitor';
import {syncWorkspaceNotices} from './notices';
import type {PackageSources} from './package-sources';

/** What the scheduled job gets back: one summary per check. */
export type WorkspaceRefresh = {
  dependencies: DependencyRefreshSummary & {apps: number};
  hosting: HostingRefreshSummary;
};

/** Test seams: fake sources for each check. */
export type WorkspaceRefreshOptions = {packageSources?: PackageSources; hosting?: RefreshOptions};

/**
 * Runs both workspace checks, dependencies first, then hosting. Each check
 * already survives a failing source on its own, so one never stops the other.
 */
export async function refreshWorkspaceHealth(
  db: AppDatabase,
  workspaceId: string,
  options: WorkspaceRefreshOptions = {},
): Promise<WorkspaceRefresh> {
  const dependencies = await refreshWorkspaceDependencyHealth(db, workspaceId, options.packageSources);
  const hosting = await refreshWorkspaceHostingHealth(db, workspaceId, options.hosting);
  // Every active app's notices follow what both checks stored (also ages end-of-support dates daily).
  await syncWorkspaceNotices(db, workspaceId, options.hosting?.now);
  return {dependencies, hosting};
}
