import {API_QUERY} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {listNotices} from '@/lib/services/notices';

/** GET /api/notices?appId=&severity=&category=&state= → `{ notices: Notice[] }` (open ones by default) */
export function GET(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId}) => {
    const query = new URL(request.url).searchParams;
    const notices = await listNotices(db, workspaceId, {
      appId: query.get(API_QUERY.appId),
      severity: query.get(API_QUERY.severity),
      category: query.get(API_QUERY.category),
      state: query.get(API_QUERY.state),
    });
    return ok({notices});
  });
}
