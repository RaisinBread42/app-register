import {API_QUERY} from '@/lib/constants';
import {created, errorResponse, ok, readJsonObject} from '@/lib/api/http';
import {getDb} from '@/lib/db/client';
import {createApp, listActiveApps, type CreateAppInput} from '@/lib/services/apps';
import {getCurrentWorkspaceId} from '@/lib/services/workspaces';

/** GET /api/apps?kind=&sort=&noticeDeadlineWithinDays= → `{ apps: AppView[] }` */
export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const params = new URL(request.url).searchParams;
    const apps = await listActiveApps(db, await getCurrentWorkspaceId(db), {
      kind: params.get(API_QUERY.kind),
      sort: params.get(API_QUERY.sort),
      noticeDeadlineWithinDays: params.get(API_QUERY.noticeDeadlineWithinDays),
    });
    return ok({apps});
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/apps → 201 `{ app: AppDetailView }` */
export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const input = await readJsonObject<CreateAppInput>(request);
    const app = await createApp(db, await getCurrentWorkspaceId(db), input);
    return created({app});
  } catch (error) {
    return errorResponse(error);
  }
}
