import {DEPENDENCY_IMPORT_MAX_BYTES} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {checkAfterWrite} from '@/lib/services/dependency-health';
import {importDependencies} from '@/lib/services/dependency-import';

type Context = {params: Promise<{id: string}>};

/**
 * POST /api/apps/:id/dependencies/import → `{ import: ImportSummary }`
 * The body is a package.json or package-lock.json, as it is on disk (at most
 * DEPENDENCY_IMPORT_MAX_BYTES). Afterwards the app's dependencies are checked
 * against the registry and advisories, for a bounded time.
 */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  return handle(
    request,
    async ({db, workspaceId, body}) => ok({import: await importDependencies(db, workspaceId, id, body)}),
    {
      maxBodyBytes: DEPENDENCY_IMPORT_MAX_BYTES,
      afterCommit: ({db, workspaceId}) => checkAfterWrite(db, workspaceId, id),
    },
  );
}
