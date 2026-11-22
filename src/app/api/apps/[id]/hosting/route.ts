import {created, handle, jsonObject, ok} from '@/lib/api/http';
import {getApp} from '@/lib/services/apps';
import type {HostingInput} from '@/lib/services/hosting';
import {addHostingAndCheck} from '@/lib/services/hosting-monitor';

type Context = {params: Promise<{id: string}>};

/** GET /api/apps/:id/hosting → `{ hosting: Hosting[] }` */
export async function GET(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId}) =>
    ok({hosting: (await getApp(db, workspaceId, id)).hosting}),
  );
}

/** POST /api/apps/:id/hosting → 201 `{ hosting: Hosting }` (checked against the monitoring sources before it answers) */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId, body}) =>
    created({hosting: await addHostingAndCheck(db, workspaceId, id, jsonObject<HostingInput>(body))}),
  );
}
