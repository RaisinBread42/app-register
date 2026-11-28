import {handle, ok} from '@/lib/api/http';
import {getNotice} from '@/lib/services/notices';

type Context = {params: Promise<{id: string}>};

/** GET /api/notices/:id → `{ notice: Notice }` with its source and the active apps it matches */
export async function GET(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId}) => ok({notice: await getNotice(db, workspaceId, id)}));
}
