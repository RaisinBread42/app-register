import {UI_QUERY, UI_QUERY_ON} from '@/lib/constants';
import {todayIso} from '@/lib/notice-alerts';
import {apiClient} from '@/lib/ui/api-client';
import {topIssues} from '@/lib/ui/catalog';
import {appListViewFrom, textParam, type SearchParams} from '@/lib/ui/list-filters';
import {ownerOptions} from './people-options';
import {ApplicationsView} from './ApplicationsView';

export default async function ApplicationsPage({searchParams}: {searchParams: Promise<SearchParams>}) {
  const params = await searchParams;
  const client = apiClient();
  // Notices only feed the issue column: if they fail, the list still shows and says so.
  const [apps, people, notices] = await Promise.all([client.listApps(), client.listPeople(), client.listNotices().catch(() => null)]);
  return (
    <ApplicationsView
      apps={apps}
      issues={notices ? Object.fromEntries(topIssues(notices)) : null}
      people={ownerOptions(people)}
      addKey={crypto.randomUUID()}
      initialView={appListViewFrom(params)}
      isAddOpen={textParam(params, UI_QUERY.add) === UI_QUERY_ON}
      today={todayIso()}
    />
  );
}
