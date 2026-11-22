import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/VStack';
import {APP_KINDS, ROUTES} from '@/lib/constants';
import {apiClient} from '@/lib/ui/api-client';
import {emptyAppForm} from '@/lib/ui/forms';
import {PageHeader} from '../../_components/PageHeader';
import {AppForm} from '../AppForm';
import {ownerOptions} from '../people-options';

export default async function NewAppPage() {
  const people = await apiClient().listPeople();
  return (
    <VStack gap={5}>
      <PageHeader
        title="Add app"
        description="Name it, give it an owner and a backup, and record the dates that matter."
        back={<Button label="Apps" variant="ghost" size="sm" href={ROUTES.apps} />}
      />
      <AppForm idempotencyKey={crypto.randomUUID()} initial={emptyAppForm(APP_KINDS[0])} people={ownerOptions(people)} />
    </VStack>
  );
}
