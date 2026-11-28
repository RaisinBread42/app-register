import {RESOURCE_KIND} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {getApp, unarchiveApp} from '@/lib/services/apps';

type Context = {params: Promise<{id: string}>};

/** POST /api/apps/:id/unarchive → `{ app: AppDetail }` (active again; alerts rescheduled; recorded in the audit history) */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId, actor}) => {
    await unarchiveApp(db, workspaceId, id, actor);
    const app = await getApp(db, workspaceId, id);
    return ok({app}, {kind: RESOURCE_KIND.app, id: app.id});
  });
}
