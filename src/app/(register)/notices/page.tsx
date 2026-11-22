import {apiClient} from '@/lib/ui/api-client';
import {alertListFilter, type SearchParams} from '@/lib/ui/list-filters';
import {keysFor} from '../_components/idempotency-keys';
import {NoticesView} from './NoticesView';

export default async function NoticesPage({searchParams}: {searchParams: Promise<SearchParams>}) {
  const filter = alertListFilter(await searchParams);
  const alerts = await apiClient().listAlerts(filter);
  return <NoticesView alerts={alerts} status={filter.status} keys={keysFor(alerts)} />;
}
