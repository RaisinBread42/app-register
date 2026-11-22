import {UI_QUERY, UI_QUERY_ON} from '@/lib/constants';
import {apiClient} from '@/lib/ui/api-client';
import {textParam, type SearchParams} from '@/lib/ui/list-filters';
import {ownerOptions} from './people-options';
import {ApplicationsView} from './ApplicationsView';

export default async function ApplicationsPage({searchParams}: {searchParams: Promise<SearchParams>}) {
  const params = await searchParams;
  const [apps, people] = await Promise.all([apiClient().listApps(), apiClient().listPeople()]);
  return (
    <ApplicationsView
      apps={apps}
      people={ownerOptions(people)}
      addKey={crypto.randomUUID()}
      initialQuery={textParam(params, UI_QUERY.search)}
      isAddOpen={textParam(params, UI_QUERY.add) === UI_QUERY_ON}
    />
  );
}
