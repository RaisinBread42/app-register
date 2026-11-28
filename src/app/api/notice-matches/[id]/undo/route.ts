import {RESOURCE_KIND} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {undoLastAction} from '@/lib/services/notice-actions';
import {getMatch} from '@/lib/services/notices';

type Context = {params: Promise<{id: string}>};

/** POST /api/notice-matches/:id/undo → `{ match }`: reverses the latest status change or assignment with a new audit event. */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId, actor}) => {
    await undoLastAction(db, workspaceId, id, actor);
    return ok({match: await getMatch(db, workspaceId, id)}, {kind: RESOURCE_KIND.noticeMatch, id});
  });
}
