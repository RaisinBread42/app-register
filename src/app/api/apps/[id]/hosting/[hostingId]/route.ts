import {handle, jsonObject, noContent, ok} from '@/lib/api/http';
import {removeHosting, updateHosting, type HostingInput} from '@/lib/services/hosting';
import {checkHostingAfterWrite} from '@/lib/services/hosting-monitor';

type Context = {params: Promise<{id: string; hostingId: string}>};

/** PATCH /api/apps/:id/hosting/:hostingId → `{ hosting: Hosting }`, then the row is checked again. */
export async function PATCH(request: Request, {params}: Context): Promise<Response> {
  const {id, hostingId} = await params;
  return handle(
    request,
    async ({db, workspaceId, body}) =>
      ok({
        hosting: await updateHosting(
          db,
          workspaceId,
          id,
          hostingId,
          jsonObject<Partial<HostingInput>>(body),
        ),
      }),
    {afterCommit: ({db, workspaceId}) => checkHostingAfterWrite(db, workspaceId, id, [hostingId])},
  );
}

/** DELETE /api/apps/:id/hosting/:hostingId → 204 */
export async function DELETE(request: Request, {params}: Context): Promise<Response> {
  const {id, hostingId} = await params;
  return handle(request, async ({db, workspaceId}) => {
    await removeHosting(db, workspaceId, id, hostingId);
    return noContent();
  });
}
