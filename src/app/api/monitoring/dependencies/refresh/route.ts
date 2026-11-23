import {handle, ok} from '@/lib/api/http';
import {refreshWorkspaceDependencyHealth} from '@/lib/services/dependency-health';

/**
 * POST /api/monitoring/dependencies/refresh → `{ refresh: WorkspaceRefreshSummary }`
 * Checks the dependencies of every active app in the workspace. A daily
 * scheduled job calls this. Safe to repeat.
 */
export function POST(request: Request): Promise<Response> {
  return handle(
    request,
    async ({db, workspaceId}) => ok({refresh: await refreshWorkspaceDependencyHealth(db, workspaceId)}),
    {isSafeToRepeat: true},
  );
}
