import {redirect} from 'next/navigation';
import {ROUTES, UI_QUERY, UI_QUERY_ON} from '@/lib/constants';

/** Adding an app is now a dialog on the applications list. */
export default function LegacyNewAppPage() {
  redirect(`${ROUTES.applications}?${new URLSearchParams({[UI_QUERY.add]: UI_QUERY_ON})}`);
}
