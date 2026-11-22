import {handle, ok} from '@/lib/api/http';
import {refreshDependencyHealth} from '@/lib/services/dependency-health';

type Context = {params: Promise<{id: string}>};

/**
 * POST /api/apps/:id/dependencies/refresh → `{ refresh: RefreshSummary }`
 * Checks the app's dependencies against the npm registry and OSV now. Safe to repeat.
 */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(
    request,
    async ({db, workspaceId}) => ok({refresh: await refreshDependencyHealth(db, workspaceId, id)}),
    {isSafeToRepeat: true},
  );
}
