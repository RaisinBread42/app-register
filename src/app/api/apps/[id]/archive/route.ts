import {handle, ok} from '@/lib/api/http';
import {archiveApp, getApp} from '@/lib/services/apps';

type Context = {params: Promise<{id: string}>};

/** POST /api/apps/:id/archive → `{ app: AppDetail }` (soft delete; frees the name) */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId}) => {
    await archiveApp(db, workspaceId, id);
    return ok({app: await getApp(db, workspaceId, id)});
  });
}
