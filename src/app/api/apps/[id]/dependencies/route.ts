import {created, handle, jsonObject, ok} from '@/lib/api/http';
import {getApp} from '@/lib/services/apps';
import {addDependency, type DependencyInput, type DependencyView} from '@/lib/services/dependencies';
import {refreshDependencyHealth} from '@/lib/services/dependency-health';

type Context = {params: Promise<{id: string}>};

/** GET /api/apps/:id/dependencies → `{ dependencies: Dependency[] }` */
export async function GET(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId}) =>
    ok({dependencies: (await getApp(db, workspaceId, id)).dependencies}),
  );
}

/** POST /api/apps/:id/dependencies → 201 `{ dependency: Dependency }`, then the new dependency is checked. */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(
    request,
    async ({db, workspaceId, body}) =>
      created({
        dependency: await addDependency(db, workspaceId, id, jsonObject<DependencyInput>(body)),
      }),
    {
      afterCommit: ({db, workspaceId}, result) =>
        refreshDependencyHealth(db, workspaceId, id, {only: [(result.body as {dependency: DependencyView}).dependency.id]}),
    },
  );
}
