import {handle, ok} from '@/lib/api/http';
import {refreshWorkspaceHealth} from '@/lib/services/monitoring';

/**
 * POST /api/monitoring/refresh → `{ refresh: { dependencies, hosting } }`
 * Runs both workspace checks: every active app's dependencies, then its hosting.
 * The daily scheduled job calls this one endpoint. Safe to repeat.
 */
export function POST(request: Request): Promise<Response> {
  return handle(
    request,
    async ({db, workspaceId}) => ok({refresh: await refreshWorkspaceHealth(db, workspaceId)}),
    {isSafeToRepeat: true},
  );
}
