import {RESOURCE_KIND} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {acknowledgeAlert} from '@/lib/services/notice-alerts';

type Context = {params: Promise<{id: string}>};

/** POST /api/notice-alerts/:id/acknowledge → `{ alert: NoticeAlert }` (never changes the app) */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId}) => {
    const alert = await acknowledgeAlert(db, workspaceId, id);
    return ok({alert}, {kind: RESOURCE_KIND.noticeAlert, id: alert.id});
  });
}
