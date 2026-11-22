import {UI_QUERY} from '@/lib/constants';
import {appTab, type SearchParams} from '@/lib/ui/list-filters';
import {keysFor} from '../../_components/idempotency-keys';
import {AppDetailView} from './AppDetailView';
import {loadApp} from './load-app';

type Props = {params: Promise<{id: string}>; searchParams: Promise<SearchParams>};

export default async function AppPage({params, searchParams}: Props) {
  const [{id}, query] = await Promise.all([params, searchParams]);
  const app = await loadApp(id);
  return (
    <AppDetailView
      app={app}
      initialTab={appTab(query[UI_QUERY.tab])}
      keys={{
        archive: crypto.randomUUID(),
        addDependency: crypto.randomUUID(),
        addHosting: crypto.randomUUID(),
        dependencies: keysFor(app.dependencies),
        hosting: keysFor(app.hosting),
        alerts: keysFor(app.alerts),
      }}
    />
  );
}
