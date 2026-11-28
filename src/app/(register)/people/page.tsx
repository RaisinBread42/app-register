import {redirect} from 'next/navigation';
import {SETTINGS_SECTION, settingsRoute} from '@/lib/constants';

/** People became Settings › People (ADR 0003); old links land there. */
export default function LegacyPeoplePage() {
  redirect(settingsRoute(SETTINGS_SECTION.people));
}
