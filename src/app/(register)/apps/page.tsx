import {redirect} from 'next/navigation';
import {ROUTES} from '@/lib/constants';

/** The first UI's apps list moved to /applications. */
export default function LegacyAppsPage() {
  redirect(ROUTES.applications);
}
