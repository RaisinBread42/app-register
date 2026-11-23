import {handle, ok} from '@/lib/api/http';
import {refreshWorkspaceHostingHealth} from '@/lib/services/hosting-monitor';

/**
 * POST /api/monitoring/hosting/refresh → `{ refresh: HostingRefreshSummary }`
 * Checks the hosting of every active app in the workspace. Safe to repeat.
 */
export function POST(request: Request): Promise<Response> {
  return handle(
    request,
    async ({db, workspaceId}) => ok({refresh: await refreshWorkspaceHostingHealth(db, workspaceId)}),
    {isSafeToRepeat: true},
  );
}
