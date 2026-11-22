import {NextResponse, type NextRequest} from 'next/server';
import {API_HEADER, ENV, HTTP_STATUS, UI_BASIC_AUTH_REALM} from '@/lib/constants';
import {BASIC_AUTH_VERDICT, checkBasicAuth, isApiPath} from '@/lib/ui/basic-auth';

/**
 * Every UI route (pages, server actions, assets) needs the shared UI_PASSWORD
 * over HTTP Basic auth. `/api/*` is left alone: it has its own bearer keys.
 * Fails closed: with no UI_PASSWORD set, the UI answers 503 instead of opening up.
 */
export function proxy(request: NextRequest): NextResponse {
  if (isApiPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  const verdict = checkBasicAuth(request.headers.get(API_HEADER.authorization), process.env[ENV.uiPassword]);
  if (verdict === BASIC_AUTH_VERDICT.allow) {
    return NextResponse.next();
  }
  if (verdict === BASIC_AUTH_VERDICT.notConfigured) {
    return new NextResponse(`The UI is locked: ${ENV.uiPassword} is not set.`, {
      status: HTTP_STATUS.serviceUnavailable,
    });
  }
  return new NextResponse('Password required.', {
    status: HTTP_STATUS.unauthorized,
    headers: {[API_HEADER.wwwAuthenticate]: `Basic realm="${UI_BASIC_AUTH_REALM}", charset="UTF-8"`},
  });
}
