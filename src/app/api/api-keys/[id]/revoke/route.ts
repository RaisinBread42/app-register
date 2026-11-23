import {RESOURCE_KIND} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {listApiKeys, revokeApiKey} from '@/lib/services/api-keys';
import {NotFoundError} from '@/lib/services/errors';

type Context = {params: Promise<{id: string}>};

/** POST /api/api-keys/:id/revoke → `{ apiKey: ListedApiKey }` (unrestricted keys only). */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(request, async ({db, workspaceId}) => {
    await revokeApiKey(db, workspaceId, id);
    const apiKey = (await listApiKeys(db, workspaceId)).find((row) => row.id === id);
    if (!apiKey) {
      throw new NotFoundError('API key not found');
    }
    return ok({apiKey}, {kind: RESOURCE_KIND.apiKey, id: apiKey.id});
  });
}
