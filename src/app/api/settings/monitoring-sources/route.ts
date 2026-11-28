import {handle, ok} from '@/lib/api/http';
import {listMonitoringSources} from '@/lib/services/monitoring-sources';

/** GET /api/settings/monitoring-sources → `{ sources: MonitoringSource[] }` */
export function GET(request: Request): Promise<Response> {
  return handle(request, async ({db, workspaceId}) =>
    ok({sources: await listMonitoringSources(db, workspaceId)}),
  );
}
