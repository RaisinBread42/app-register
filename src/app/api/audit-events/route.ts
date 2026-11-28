import {API_QUERY} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {listAuditEvents} from '@/lib/services/notice-actions';

/** GET /api/audit-events?appId=&noticeId=&matchId=&limit=&before= → `{ events }`, newest first. */
export function GET(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId}) => {
    const query = new URL(request.url).searchParams;
    const events = await listAuditEvents(db, workspaceId, {
      appId: query.get(API_QUERY.appId),
      noticeId: query.get(API_QUERY.noticeId),
      matchId: query.get(API_QUERY.matchId),
      limit: query.get(API_QUERY.limit),
      before: query.get(API_QUERY.before),
    });
    return ok({events});
  });
}
