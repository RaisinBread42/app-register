import {apiClient} from '@/lib/ui/api-client';
import {keysFor} from '../_components/idempotency-keys';
import {PeopleView} from './PeopleView';

export default async function PeoplePage() {
  const people = await apiClient().listPeople();
  return (
    <PeopleView
      people={people}
      keys={{
        add: crypto.randomUUID(),
        reactivate: crypto.randomUUID(),
        edit: keysFor(people),
        markLeft: keysFor(people),
      }}
    />
  );
}
