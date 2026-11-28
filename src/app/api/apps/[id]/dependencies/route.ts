import {API_KEY_SCOPE, RESOURCE_KIND} from '@/lib/constants';
import {created, handle, jsonObject, ok} from '@/lib/api/http';
import {getApp} from '@/lib/services/apps';
import {addDependency, type DependencyInput, type DependencyView} from '@/lib/services/dependencies';
import {checkAfterWrite} from '@/lib/services/dependency-health';

type Context = {params: Promise<{id: string}>};

/** GET /api/apps/:id/dependencies → `{ dependencies: Dependency[] }` */
export async function GET(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(
    request,
    async ({db, workspaceId}) => ok({dependencies: (await getApp(db, workspaceId, id)).dependencies}),
    {requiredScope: API_KEY_SCOPE.dependenciesRead},
  );
}

/** POST /api/apps/:id/dependencies → 201 `{ dependency: Dependency }`, then the new dependency is checked. */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(
    request,
    async ({db, workspaceId, body}) => {
      const dependency = await addDependency(db, workspaceId, id, jsonObject<DependencyInput>(body));
      return created({dependency}, {kind: RESOURCE_KIND.dependency, id: dependency.id});
    },
    {
      requiredScope: API_KEY_SCOPE.dependenciesWrite,
      afterCommit: ({db, workspaceId}, result) =>
        checkAfterWrite(db, workspaceId, id, [(result.body as {dependency: DependencyView}).dependency.id]),
    },
  );
}
