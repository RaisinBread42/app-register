import {APP_ACTIVITY_LIMIT, UI_QUERY} from '@/lib/constants';
import {todayIso} from '@/lib/notice-alerts';
import {apiClient} from '@/lib/ui/api-client';
import {appTab, type SearchParams} from '@/lib/ui/list-filters';
import {keysFor} from '../../_components/idempotency-keys';
import {AppDetailView} from './AppDetailView';
import {loadApp} from './load-app';

type Props = {params: Promise<{id: string}>; searchParams: Promise<SearchParams>};

export default async function AppPage({params, searchParams}: Props) {
  const [{id}, query] = await Promise.all([params, searchParams]);
  const app = await loadApp(id);
  const client = apiClient();
  const [catalog, notices, activity] = await Promise.all([
    client.getHostingCatalog(),
    client.listNotices({appId: app.id}),
    client.listAuditEvents({appId: app.id, limit: APP_ACTIVITY_LIMIT}),
  ]);
  return (
    <AppDetailView
      app={app}
      notices={notices}
      activity={activity}
      catalog={catalog}
      today={todayIso()}
      initialTab={appTab(query[UI_QUERY.tab])}
      keys={{
        archive: crypto.randomUUID(),
        addDependency: crypto.randomUUID(),
        importDependencies: crypto.randomUUID(),
        addHosting: crypto.randomUUID(),
        dependencies: keysFor(app.dependencies),
        hosting: keysFor(app.hosting),
      }}
    />
  );
}
