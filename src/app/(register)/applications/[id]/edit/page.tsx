import {Card} from '@astryxdesign/core/Card';
import {ROUTES, appRoute} from '@/lib/constants';
import {apiClient} from '@/lib/ui/api-client';
import {appToForm} from '@/lib/ui/forms';
import {PageFrame} from '../../../_components/PageFrame';
import {PageHeader} from '../../../_components/PageHeader';
import {AppForm} from '../../AppForm';
import {ownerOptions} from '../../people-options';
import {loadApp} from '../load-app';

export default async function EditAppPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const [app, people] = await Promise.all([loadApp(id), apiClient().listPeople()]);
  return (
    <PageFrame
      crumbs={[
        {label: 'Applications', href: ROUTES.applications},
        {label: app.name, href: appRoute(app.id)},
        {label: 'Edit'},
      ]}>
      <PageHeader
        title={`Edit ${app.name}`}
        description="Change owners, dates or details. A new notice deadline reschedules its alerts."
      />
      <Card padding={6} maxWidth={720}>
        <AppForm
          idempotencyKey={crypto.randomUUID()}
          initial={appToForm(app)}
          people={ownerOptions(people, app.backupOwner ? [app.owner, app.backupOwner] : [app.owner])}
          appId={app.id}
        />
      </Card>
    </PageFrame>
  );
}
