import {RESOURCE_KIND} from '@/lib/constants';
import {handle, jsonObject, noContent, ok} from '@/lib/api/http';
import {removeHosting, updateHosting, type HostingInput} from '@/lib/services/hosting';

type Context = {params: Promise<{id: string; hostingId: string}>};

/** PATCH /api/apps/:id/hosting/:hostingId → `{ hosting: Hosting }` */
export async function PATCH(request: Request, {params}: Context): Promise<Response> {
  const {id, hostingId} = await params;
  return handle(request, async ({db, workspaceId, body}) => {
    const hosting = await updateHosting(db, workspaceId, id, hostingId, jsonObject<Partial<HostingInput>>(body));
    return ok({hosting}, {kind: RESOURCE_KIND.hosting, id: hosting.id});
  });
}

/** DELETE /api/apps/:id/hosting/:hostingId → 204 */
export async function DELETE(request: Request, {params}: Context): Promise<Response> {
  const {id, hostingId} = await params;
  return handle(request, async ({db, workspaceId}) => {
    await removeHosting(db, workspaceId, id, hostingId);
    return noContent();
  });
}
