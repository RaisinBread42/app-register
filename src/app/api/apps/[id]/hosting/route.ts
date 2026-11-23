import {RESOURCE_KIND} from '@/lib/constants';
import {created, handle, jsonObject, ok} from '@/lib/api/http';
import {getApp} from '@/lib/services/apps';
import {addHosting, type HostingInput, type HostingView} from '@/lib/services/hosting';
import {checkHostingAfterWrite} from '@/lib/services/hosting-monitor';

type Context = {params: Promise<{id: string}>};

/** GET /api/apps/:id/hosting → `{ hosting: Hosting[] }` */
export async function GET(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId}) =>
    ok({hosting: (await getApp(db, workspaceId, id)).hosting}),
  );
}

/** POST /api/apps/:id/hosting → 201 `{ hosting: Hosting }`, then the new row is checked. */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(
    request,
    async ({db, workspaceId, body}) => {
      const hosting = await addHosting(db, workspaceId, id, jsonObject<HostingInput>(body));
      return created({hosting}, {kind: RESOURCE_KIND.hosting, id: hosting.id});
    },
    {
      afterCommit: ({db, workspaceId}, result) =>
        checkHostingAfterWrite(db, workspaceId, id, [(result.body as {hosting: HostingView}).hosting.id]),
    },
  );
}
