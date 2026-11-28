import {RESOURCE_KIND} from '@/lib/constants';
import {handle, jsonObject, ok} from '@/lib/api/http';
import {changeMatchStatus, type StatusChange} from '@/lib/services/notice-actions';
import {getMatch} from '@/lib/services/notices';

type Context = {params: Promise<{id: string}>};

/** POST /api/notice-matches/:id/status → `{ match }`: review, snooze (date + reason), mark handled (evidence) or reopen. */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId, body, actor}) => {
    await changeMatchStatus(db, workspaceId, id, jsonObject<StatusChange>(body), actor);
    return ok({match: await getMatch(db, workspaceId, id)}, {kind: RESOURCE_KIND.noticeMatch, id});
  });
}
