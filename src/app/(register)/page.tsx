import {todayIso} from '@/lib/notice-alerts';
import {apiClient} from '@/lib/ui/api-client';
import {ownerOptions} from './applications/people-options';
import {OverviewView} from './OverviewView';

export default async function OverviewPage() {
  const [apps, people] = await Promise.all([apiClient().listApps(), apiClient().listPeople()]);
  return <OverviewView apps={apps} people={ownerOptions(people)} addKey={crypto.randomUUID()} today={todayIso()} />;
}
