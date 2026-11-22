import {apiClient} from '@/lib/ui/api-client';
import {appListFilter, type SearchParams} from '@/lib/ui/list-filters';
import {AppsList} from './AppsList';

export default async function AppsPage({searchParams}: {searchParams: Promise<SearchParams>}) {
  const filter = appListFilter(await searchParams);
  const apps = await apiClient().listApps(filter);
  return <AppsList apps={apps} filter={filter} />;
}
