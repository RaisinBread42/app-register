import {ENV} from '@/lib/constants';
import {handle, ok} from '@/lib/api/http';
import {createEmailPort} from '@/lib/email';
import {sendDueNoticeAlerts} from '@/lib/services/notice-alert-send';

/**
 * POST /api/notice-alerts/send → `{ send: { sent } }`
 * Sends every due notice-deadline alert email for the workspace.
 * Invokable now; schedule a daily job only once `EMAIL_PROVIDER` is a real sender
 * (a sink would mark alerts sent with nowhere for the mail to land). Safe to repeat.
 */
export function POST(request: Request): Promise<Response> {
  return handle(
    request,
    async ({db, workspaceId}) => {
      const from = process.env[ENV.emailFrom] ?? '';
      const send = await sendDueNoticeAlerts(db, workspaceId, {
        email: createEmailPort(),
        from,
        appUrl: process.env[ENV.appPublicUrl] || process.env[ENV.appUrl],
      });
      return ok({send});
    },
    {isSafeToRepeat: true},
  );
}
