import {API_KEY_SCOPE} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {hostingCatalogView} from '@/lib/hosting-catalog';

/** GET /api/hosting/catalog → `{ catalog: HostingCatalog }` (the providers, services and runtimes the hosting check knows) */
export function GET(request: Request): Promise<Response> {
  return handle(request, async () => ok({catalog: hostingCatalogView()}), {requiredScope: API_KEY_SCOPE.hostingRead});
}
