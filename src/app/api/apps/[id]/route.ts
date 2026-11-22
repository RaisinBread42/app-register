import {errorResponse, ok, readJsonObject} from '@/lib/api/http';
import {getDb} from '@/lib/db/client';
import {getApp, updateApp, type UpdateAppInput} from '@/lib/services/apps';
import {getCurrentWorkspaceId} from '@/lib/services/workspaces';

type Context = {params: Promise<{id: string}>};

/** GET /api/apps/:id → `{ app: AppDetailView }` */
export async function GET(_request: Request, {params}: Context): Promise<Response> {
  try {
    const db = getDb();
    const app = await getApp(db, await getCurrentWorkspaceId(db), (await params).id);
    return ok({app});
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/apps/:id → `{ app: AppDetailView }` */
export async function PATCH(request: Request, {params}: Context): Promise<Response> {
  try {
    const db = getDb();
    const patch = await readJsonObject<UpdateAppInput>(request);
    const app = await updateApp(db, await getCurrentWorkspaceId(db), (await params).id, patch);
    return ok({app});
  } catch (error) {
    return errorResponse(error);
  }
}
