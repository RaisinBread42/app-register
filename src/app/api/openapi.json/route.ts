import {openApiSpec} from '@/lib/api/openapi';

/** GET /api/openapi.json → the OpenAPI 3.1 document. Public: it holds no data. */
export function GET(): Response {
  return Response.json(openApiSpec);
}
