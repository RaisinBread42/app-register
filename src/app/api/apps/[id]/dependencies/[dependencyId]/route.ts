import {handle, jsonObject, noContent, ok} from '@/lib/api/http';
import {refreshDependencyHealth} from '@/lib/services/dependency-health';
import {
  removeDependency,
  updateDependency,
  type DependencyInput,
} from '@/lib/services/dependencies';

type Context = {params: Promise<{id: string; dependencyId: string}>};

/** PATCH /api/apps/:id/dependencies/:dependencyId → `{ dependency: Dependency }`, then the dependency is checked again. */
export async function PATCH(request: Request, {params}: Context): Promise<Response> {
  const {id, dependencyId} = await params;
  return handle(
    request,
    async ({db, workspaceId, body}) =>
      ok({
        dependency: await updateDependency(
          db,
          workspaceId,
          id,
          dependencyId,
          jsonObject<Partial<DependencyInput>>(body),
        ),
      }),
    {afterCommit: ({db, workspaceId}) => refreshDependencyHealth(db, workspaceId, id, {only: [dependencyId]})},
  );
}

/** DELETE /api/apps/:id/dependencies/:dependencyId → 204 */
export async function DELETE(request: Request, {params}: Context): Promise<Response> {
  const {id, dependencyId} = await params;
  return handle(request, async ({db, workspaceId}) => {
    await removeDependency(db, workspaceId, id, dependencyId);
    return noContent();
  });
}
