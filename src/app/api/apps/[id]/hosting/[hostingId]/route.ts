import {handle, jsonObject, noContent, ok} from '@/lib/api/http';
import {removeHosting, type HostingInput} from '@/lib/services/hosting';
import {updateHostingAndCheck} from '@/lib/services/hosting-monitor';

type Context = {params: Promise<{id: string; hostingId: string}>};

/** PATCH /api/apps/:id/hosting/:hostingId → `{ hosting: Hosting }` */
export async function PATCH(request: Request, {params}: Context): Promise<Response> {
  const {id, hostingId} = await params;
  return handle(request, async ({db, workspaceId, body}) =>
    ok({
      hosting: await updateHostingAndCheck(
        db,
        workspaceId,
        id,
        hostingId,
        jsonObject<Partial<HostingInput>>(body),
      ),
    }),
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
