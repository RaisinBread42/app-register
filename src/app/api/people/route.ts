import {created, errorResponse, ok, readJsonObject} from '@/lib/api/http';
import {getDb} from '@/lib/db/client';
import {createPerson, listActivePeople, type CreatePersonInput} from '@/lib/services/people';
import {getCurrentWorkspaceId} from '@/lib/services/workspaces';

/** GET /api/people → `{ people: PersonView[] }` (active people only) */
export async function GET(): Promise<Response> {
  try {
    const db = getDb();
    const people = await listActivePeople(db, await getCurrentWorkspaceId(db));
    return ok({people});
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/people → 201 `{ person: PersonView }` */
export async function POST(request: Request): Promise<Response> {
  try {
    const db = getDb();
    const input = await readJsonObject<CreatePersonInput>(request);
    const person = await createPerson(db, await getCurrentWorkspaceId(db), input);
    return created({person});
  } catch (error) {
    return errorResponse(error);
  }
}
