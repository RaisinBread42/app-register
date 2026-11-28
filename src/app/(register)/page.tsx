import {todayIso} from '@/lib/notice-alerts';
import {apiClient} from '@/lib/ui/api-client';
import {OVERVIEW_ACTIVITY_LIMIT} from '@/lib/ui/overview';
import {ownerOptions} from './applications/people-options';
import {OverviewView} from './OverviewView';

/** Overview loads summaries only (no per-app detail): apps, open notices, sources and recent activity. */
export default async function OverviewPage() {
  const client = apiClient();
  const [apps, people, notices, sources, activity] = await Promise.all([
    client.listApps(),
    client.listPeople(),
    client.listNotices(),
    client.listMonitoringSources(),
    client.listAuditEvents({limit: OVERVIEW_ACTIVITY_LIMIT}),
  ]);
  return (
    <OverviewView
      apps={apps}
      notices={notices}
      sources={sources}
      activity={activity}
      people={ownerOptions(people)}
      addKey={crypto.randomUUID()}
      today={todayIso()}
    />
  );
}
