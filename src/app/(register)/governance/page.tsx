import {todayIso} from '@/lib/notice-alerts';
import {apiClient} from '@/lib/ui/api-client';
import {GovernanceView} from './GovernanceView';

/**
 * The Governance Board ([49]): a read-only summary over data the register already holds
 * (apps, notices, people, sources). Only active people's ids reach the browser: the board
 * needs to know who is still active, not anyone's email.
 */
export default async function GovernancePage() {
  const client = apiClient();
  const [apps, people, notices, sources] = await Promise.all([
    client.listApps(),
    client.listPeople(),
    client.listNotices(),
    client.listMonitoringSources().catch(() => null),
  ]);
  return (
    <GovernanceView apps={apps} activePersonIds={people.map((person) => person.id)} notices={notices} sources={sources} today={todayIso()} now={new Date().toISOString()} />
  );
}
