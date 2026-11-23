import {RESOURCE_KIND} from '@/lib/constants';
import {created, handle, jsonObject, ok} from '@/lib/api/http';
import {getApp} from '@/lib/services/apps';
import {addHosting, type HostingInput} from '@/lib/services/hosting';

type Context = {params: Promise<{id: string}>};

/** GET /api/apps/:id/hosting → `{ hosting: Hosting[] }` */
export async function GET(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId}) =>
    ok({hosting: (await getApp(db, workspaceId, id)).hosting}),
  );
}

/** POST /api/apps/:id/hosting → 201 `{ hosting: Hosting }` */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId, body}) => {
    const hosting = await addHosting(db, workspaceId, id, jsonObject<HostingInput>(body));
    return created({hosting}, {kind: RESOURCE_KIND.hosting, id: hosting.id});
  });
}
