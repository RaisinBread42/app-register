import {API_QUERY} from '@/lib/constants';
import {errorResponse, ok} from '@/lib/api/http';
import {getDb} from '@/lib/db/client';
import {listAlerts} from '@/lib/services/notice-alerts';
import {getCurrentWorkspaceId} from '@/lib/services/workspaces';

/** GET /api/notice-alerts?status=&appId= → `{ alerts: NoticeAlertView[] }` */
export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const params = new URL(request.url).searchParams;
    const alerts = await listAlerts(db, await getCurrentWorkspaceId(db), {
      status: params.get(API_QUERY.status),
      appId: params.get(API_QUERY.appId),
    });
    return ok({alerts});
  } catch (error) {
    return errorResponse(error);
  }
}
