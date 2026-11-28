import {API_KEY_SCOPE, API_QUERY, APP_STATE, APP_STATES, RESOURCE_KIND} from '@/lib/constants';
import {created, handle, jsonObject, ok} from '@/lib/api/http';
import {createApp, listActiveApps, listArchivedApps, type CreateAppInput} from '@/lib/services/apps';
import {ValidationError} from '@/lib/services/errors';

/** GET /api/apps?kind=&sort=&noticeDeadlineWithinDays=&state= → `{ apps: App[] }`; `state=archived` lists archived apps by name (the other filters do not apply). */
export function GET(request: Request): Promise<Response> {
  return handle(
    request,
    async ({db, workspaceId}) => {
      const params = new URL(request.url).searchParams;
      const state = params.get(API_QUERY.state) ?? APP_STATE.active;
      if (!(APP_STATES as readonly string[]).includes(state)) {
        throw new ValidationError(`state must be one of: ${APP_STATES.join(', ')}`);
      }
      if (state === APP_STATE.archived) {
        return ok({apps: await listArchivedApps(db, workspaceId)});
      }
      const apps = await listActiveApps(db, workspaceId, {
        kind: params.get(API_QUERY.kind),
        sort: params.get(API_QUERY.sort),
        noticeDeadlineWithinDays: params.get(API_QUERY.noticeDeadlineWithinDays),
      });
      return ok({apps});
    },
    {requiredScope: API_KEY_SCOPE.appsRead},
  );
}

/** POST /api/apps → 201 `{ app: AppDetail }` */
export function POST(request: Request): Promise<Response> {
  return handle(
    request,
    async ({db, workspaceId, body}) => {
      const app = await createApp(db, workspaceId, jsonObject<CreateAppInput>(body));
      return created({app}, {kind: RESOURCE_KIND.app, id: app.id});
    },
    {requiredScope: API_KEY_SCOPE.appsWrite},
  );
}
