import {errorResponse, ok} from '@/lib/api/http';
import {getDb} from '@/lib/db/client';
import {acknowledgeAlert} from '@/lib/services/notice-alerts';
import {getCurrentWorkspaceId} from '@/lib/services/workspaces';

type Context = {params: Promise<{id: string}>};

/** POST /api/notice-alerts/:id/acknowledge → `{ alert: NoticeAlertView }` */
export async function POST(_request: Request, {params}: Context): Promise<Response> {
  try {
    const db = getDb();
    const alert = await acknowledgeAlert(db, await getCurrentWorkspaceId(db), (await params).id);
    return ok({alert});
  } catch (error) {
    return errorResponse(error);
  }
}
