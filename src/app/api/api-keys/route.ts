import {
  APPLICATIONS_REGISTER_SCOPES,
  RESOURCE_KIND,
} from '@/lib/constants';
import {created, handle, jsonObject, ok} from '@/lib/api/http';
import {createApiKey, listApiKeys} from '@/lib/services/api-keys';

/** GET /api/api-keys → `{ apiKeys: ListedApiKey[] }` (unrestricted keys only). */
export function GET(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId}) => ok({apiKeys: await listApiKeys(db, workspaceId)}));
}

/**
 * POST /api/api-keys → 201 `{ apiKey: CreatedApiKey }`
 * Body: `{ name, expiresOn?: YYYY-MM-DD | null }`. Settings-created keys get the
 * applications-register scopes. The full `key` is only in this response.
 */
export function POST(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId, body}) => {
    const input = jsonObject<{name: string; expiresOn?: string | null}>(body);
    const createdKey = await createApiKey(db, workspaceId, input.name, {
      expiresOn: input.expiresOn,
      scopes: APPLICATIONS_REGISTER_SCOPES,
    });
    const listed = (await listApiKeys(db, workspaceId)).find((row) => row.id === createdKey.id);
    const apiKey = {...(listed ?? createdKey), key: createdKey.key};
    return created({apiKey}, {kind: RESOURCE_KIND.apiKey, id: createdKey.id});
  });
}
