import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/VStack';
import {appRoute} from '@/lib/constants';
import {apiClient} from '@/lib/ui/api-client';
import {appToForm} from '@/lib/ui/forms';
import {PageHeader} from '../../../_components/PageHeader';
import {AppForm} from '../../AppForm';
import {ownerOptions} from '../../people-options';
import {loadApp} from '../load-app';

export default async function EditAppPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const [app, people] = await Promise.all([loadApp(id), apiClient().listPeople()]);
  return (
    <VStack gap={5}>
      <PageHeader
        title={`Edit ${app.name}`}
        description="Change owners, dates or details. A new notice deadline reschedules its alerts."
        back={<Button label={app.name} variant="ghost" size="sm" href={appRoute(app.id)} />}
      />
      <AppForm
        idempotencyKey={crypto.randomUUID()}
        initial={appToForm(app)}
        people={ownerOptions(people, [app.owner, app.backupOwner])}
        appId={app.id}
      />
    </VStack>
  );
}
