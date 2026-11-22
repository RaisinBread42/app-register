import {redirect} from 'next/navigation';
import {ROUTES} from '@/lib/constants';

/** Notices are email-only now; the old page sends people to the overview. */
export default function LegacyNoticesPage() {
  redirect(ROUTES.home);
}
