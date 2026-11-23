import {API_QUERY, RESOURCE_KIND} from '@/lib/constants';
import {created, handle, jsonObject, ok} from '@/lib/api/http';
import {createApp, listActiveApps, type CreateAppInput} from '@/lib/services/apps';

/** GET /api/apps?kind=&sort=&noticeDeadlineWithinDays= → `{ apps: App[] }` */
export function GET(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId}) => {
    const params = new URL(request.url).searchParams;
    const apps = await listActiveApps(db, workspaceId, {
      kind: params.get(API_QUERY.kind),
      sort: params.get(API_QUERY.sort),
      noticeDeadlineWithinDays: params.get(API_QUERY.noticeDeadlineWithinDays),
    });
    return ok({apps});
  });
}

/** POST /api/apps → 201 `{ app: AppDetail }` */
export function POST(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId, body}) => {
    const app = await createApp(db, workspaceId, jsonObject<CreateAppInput>(body));
    return created({app}, {kind: RESOURCE_KIND.app, id: app.id});
  });
}
