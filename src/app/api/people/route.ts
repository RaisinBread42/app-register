import {created, handle, jsonObject, ok} from '@/lib/api/http';
import {createPerson, listActivePeople, type CreatePersonInput} from '@/lib/services/people';

/** GET /api/people → `{ people: Person[] }` (active people only) */
export function GET(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId}) =>
    ok({people: await listActivePeople(db, workspaceId)}),
  );
}

/** POST /api/people → 201 `{ person: Person }` */
export function POST(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId, body}) =>
    created({person: await createPerson(db, workspaceId, jsonObject<CreatePersonInput>(body))}),
  );
}
