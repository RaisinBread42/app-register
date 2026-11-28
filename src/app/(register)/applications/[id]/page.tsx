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
  const client = apiClient();
  // All at once; notices and activity are secondary, so if either fails the page still shows the app.
  const [app, catalog, notices, activity] = await Promise.all([
    loadApp(id),
    client.getHostingCatalog(),
    client.listNotices({appId: id}).catch(() => null),
    client.listAuditEvents({appId: id, limit: APP_ACTIVITY_LIMIT}).catch(() => null),
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
