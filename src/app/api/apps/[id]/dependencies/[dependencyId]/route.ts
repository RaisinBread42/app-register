import {handle, jsonObject, noContent, ok} from '@/lib/api/http';
import {
  removeDependency,
  updateDependency,
  type DependencyInput,
} from '@/lib/services/dependencies';

type Context = {params: Promise<{id: string; dependencyId: string}>};

/** PATCH /api/apps/:id/dependencies/:dependencyId → `{ dependency: Dependency }` */
export async function PATCH(request: Request, {params}: Context): Promise<Response> {
  const {id, dependencyId} = await params;
  return handle(request, async ({db, workspaceId, body}) =>
    ok({
      dependency: await updateDependency(
        db,
        workspaceId,
        id,
        dependencyId,
        jsonObject<Partial<DependencyInput>>(body),
      ),
    }),
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
