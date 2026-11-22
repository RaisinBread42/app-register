import {API_HEADER, DEPENDENCY_IMPORT_MAX_BYTES, HTTP_STATUS} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {refreshDependencyHealth} from '@/lib/services/dependency-health';
import {importDependencies} from '@/lib/services/dependency-import';

type Context = {params: Promise<{id: string}>};

/**
 * POST /api/apps/:id/dependencies/import → `{ import: ImportSummary }`
 * The body is a package.json or package-lock.json, as it is on disk. Afterwards
 * every dependency of the app is checked against the registry and advisories.
 */
export async function POST(request: Request, {params}: Context): Promise<Response> {
  const {id} = await params;
  // Refuse an oversized upload before reading it; the service checks the real size too.
  if (Number(request.headers.get(API_HEADER.contentLength)) > DEPENDENCY_IMPORT_MAX_BYTES) {
    return Response.json({error: 'The file is too large'}, {status: HTTP_STATUS.badRequest});
  }
  return handle(
    request,
    async ({db, workspaceId, body}) => ok({import: await importDependencies(db, workspaceId, id, body)}),
    {afterCommit: ({db, workspaceId}) => refreshDependencyHealth(db, workspaceId, id)},
  );
}
