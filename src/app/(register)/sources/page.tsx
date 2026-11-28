import {redirect} from 'next/navigation';
import {SETTINGS_SECTION, settingsRoute} from '@/lib/constants';

/** Sources became Settings › Monitoring sources (spec §4, ADR 0003); old links land there. */
export default function LegacySourcesPage() {
  redirect(settingsRoute(SETTINGS_SECTION.sources));
}
