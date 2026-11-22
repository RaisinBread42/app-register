import {handle, ok} from '@/lib/api/http';
import {refreshHostingHealth} from '@/lib/services/hosting-monitor';

type Context = {params: Promise<{id: string}>};

/** POST /api/apps/:id/hosting/refresh → `{ hosting: Hosting[] }` (checks end of support and provider status now) */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId}) =>
    ok({hosting: await refreshHostingHealth(db, workspaceId, id)}),
  );
}
