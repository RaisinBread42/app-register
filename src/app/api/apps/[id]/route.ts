import {RESOURCE_KIND} from '@/lib/constants';
import {handle, jsonObject, ok} from '@/lib/api/http';
import {getApp, updateApp, type UpdateAppInput} from '@/lib/services/apps';

type Context = {params: Promise<{id: string}>};

/** GET /api/apps/:id → `{ app: AppDetail }` */
export async function GET(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId}) => ok({app: await getApp(db, workspaceId, id)}));
}

/** PATCH /api/apps/:id → `{ app: AppDetail }` */
export async function PATCH(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId, body}) => {
    const app = await updateApp(db, workspaceId, id, jsonObject<UpdateAppInput>(body));
    return ok({app}, {kind: RESOURCE_KIND.app, id: app.id});
  });
}
