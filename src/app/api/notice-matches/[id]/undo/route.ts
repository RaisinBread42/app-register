import {RESOURCE_KIND} from '@/lib/constants';
import {handle, jsonObject, ok} from '@/lib/api/http';
import {undoLastAction, type UndoTarget} from '@/lib/services/notice-actions';
import {getMatch} from '@/lib/services/notices';

type Context = {params: Promise<{id: string}>};

/**
 * POST /api/notice-matches/:id/undo → `{ match }`: reverses the latest status change or
 * assignment with a new audit event. An optional `{action, toValue}` names the action
 * meant, and the undo is refused when a later one has happened since.
 */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId, body, actor}) => {
    await undoLastAction(db, workspaceId, id, actor, body ? jsonObject<UndoTarget>(body) : {});
    return ok({match: await getMatch(db, workspaceId, id)}, {kind: RESOURCE_KIND.noticeMatch, id});
  });
}
