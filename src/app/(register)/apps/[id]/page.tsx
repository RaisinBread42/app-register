import {redirect} from 'next/navigation';
import {UI_QUERY, appTabRoute} from '@/lib/constants';
import {appTab, type SearchParams} from '@/lib/ui/list-filters';

type Props = {params: Promise<{id: string}>; searchParams: Promise<SearchParams>};

/** The first UI's app page moved to /applications/:id, keeping the tab. */
export default async function LegacyAppPage({params, searchParams}: Props) {
  const [{id}, query] = await Promise.all([params, searchParams]);
  redirect(appTabRoute(id, appTab(query[UI_QUERY.tab])));
}
