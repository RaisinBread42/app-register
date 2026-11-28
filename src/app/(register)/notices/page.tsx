import {todayIso} from '@/lib/notice-alerts';
import {apiClient} from '@/lib/ui/api-client';
import {hasEverAnswered, staleSources} from '@/lib/ui/freshness';
import {ownerOptions} from '../applications/people-options';
import {keysFor} from '../_components/idempotency-keys';
import {NoticesView} from './NoticesView';

/** The notice inbox (spec §4): open notices on active apps, with the source and the actions in context. */
export default async function NoticesPage() {
  const client = apiClient();
  const [notices, people, sources] = await Promise.all([client.listNotices(), client.listPeople(), client.listMonitoringSources()]);
  const matches = notices.flatMap((notice) => notice.matches);
  return (
    <NoticesView
      notices={notices}
      people={ownerOptions(people)}
      keys={{status: keysFor(matches), assign: keysFor(matches), undo: keysFor(matches)}}
      staleSources={staleSources(sources, new Date()).map((source) => source.name)}
      hasAnySourceAnswered={hasEverAnswered(sources)}
      today={todayIso()}
    />
  );
}
