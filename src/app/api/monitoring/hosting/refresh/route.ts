import {handle, ok} from '@/lib/api/http';
import {refreshWorkspaceHostingHealth} from '@/lib/services/hosting-monitor';

/** POST /api/monitoring/hosting/refresh → `{ refreshed: { apps, hosting, failedSources } }` (the daily job calls this) */
export function POST(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId}) =>
    ok({refreshed: await refreshWorkspaceHostingHealth(db, workspaceId)}),
  );
}
