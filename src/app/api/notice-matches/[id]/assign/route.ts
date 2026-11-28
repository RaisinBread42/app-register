import {RESOURCE_KIND} from '@/lib/constants';
import {handle, jsonObject, ok} from '@/lib/api/http';
import {assignMatch, type Assignment} from '@/lib/services/notice-actions';
import {getMatch} from '@/lib/services/notices';

type Context = {params: Promise<{id: string}>};

/** POST /api/notice-matches/:id/assign → `{ match }`: assign an active person, or clear with `assigneeId: null`. */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId, body, actor}) => {
    await assignMatch(db, workspaceId, id, jsonObject<Assignment>(body), actor);
    return ok({match: await getMatch(db, workspaceId, id)}, {kind: RESOURCE_KIND.noticeMatch, id});
  });
}
