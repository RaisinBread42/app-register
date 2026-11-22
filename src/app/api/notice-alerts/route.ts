import {API_QUERY} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {listAlerts} from '@/lib/services/notice-alerts';

/** GET /api/notice-alerts?status=&appId= → `{ alerts: NoticeAlert[] }` */
export function GET(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId}) => {
    const params = new URL(request.url).searchParams;
    const alerts = await listAlerts(db, workspaceId, {
      status: params.get(API_QUERY.status),
      appId: params.get(API_QUERY.appId),
    });
    return ok({alerts});
  });
}
