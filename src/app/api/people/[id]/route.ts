import {handle, jsonObject, ok} from '@/lib/api/http';
import {updatePerson, type UpdatePersonInput} from '@/lib/services/people';

type Context = {params: Promise<{id: string}>};

/** PATCH /api/people/:id → `{ person: Person }` (rename, re-email, or mark as left) */
export async function PATCH(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId, body}) =>
    ok({person: await updatePerson(db, workspaceId, id, jsonObject<UpdatePersonInput>(body))}),
  );
}
