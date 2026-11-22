'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {APP_TAB, ROUTES, editAppRoute, type AppTab} from '@/lib/constants';
import type {AppDetail} from '@/lib/ui/api-client';
import {KIND_LABEL, formatCost, orDash} from '@/lib/ui/copy';
import {archiveAppAction} from '../../actions';
import {AlertsTable} from '../../_components/AlertsTable';
import {FormError} from '../../_components/FormError';
import {PageHeader} from '../../_components/PageHeader';
import {useAction} from '../../_components/use-action';
import {DependenciesTab} from './DependenciesTab';
import {HostingTab} from './HostingTab';

export type AppDetailKeys = {
  archive: string;
  addDependency: string;
  addHosting: string;
  dependencies: Record<string, string>;
  hosting: Record<string, string>;
  alerts: Record<string, string>;
};

type Props = {app: AppDetail; initialTab: AppTab; keys: AppDetailKeys};

export function AppDetailView({app, initialTab, keys}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<string>(initialTab);
  const confirm = useImperativeAlertDialog();
  const archive = useAction();
  const isArchived = app.archivedAt !== null;

  function askToArchive() {
    confirm.show({
      title: `Archive ${app.name}?`,
      description: 'It leaves the apps list and its scheduled alerts are dropped. Its history stays.',
      actionLabel: 'Archive app',
      onAction: () => {
        confirm.hide();
        archive.run(() => archiveAppAction(keys.archive, app.id), () => router.push(ROUTES.apps));
      },
    });
  }

  return (
    <VStack gap={5}>
      <PageHeader
        title={app.name}
        description={`${KIND_LABEL[app.kind]} · Owner ${app.owner.name} · Backup ${app.backupOwner.name}`}
        back={<Button label="Apps" variant="ghost" size="sm" href={ROUTES.apps} />}
        actions={
          !isArchived && (
            <>
              <Button label="Edit app" variant="primary" href={editAppRoute(app.id)} />
              <Button label="Archive" variant="destructive" isLoading={archive.isPending} onClick={askToArchive} />
            </>
          )
        }
      />
      {isArchived && (
        <Banner status="info" title="Archived" description={`Archived on ${app.archivedAt?.slice(0, 10)}. Kept as history.`} collapsible={false} />
      )}
      <FormError error={archive.error} />

      <TabList value={tab} onChange={setTab} role="tablist" hasDivider>
        <Tab value={APP_TAB.overview} label="Overview" />
        <Tab value={APP_TAB.dependencies} label={`Dependencies (${app.dependencies.length})`} />
        <Tab value={APP_TAB.hosting} label={`Hosting (${app.hosting.length})`} />
        <Tab value={APP_TAB.alerts} label={`Notice alerts (${app.alerts.length})`} />
      </TabList>

      {tab === APP_TAB.overview && <Overview app={app} />}
      {tab === APP_TAB.dependencies && (
        <DependenciesTab app={app} addKey={keys.addDependency} editKeys={keys.dependencies} isReadOnly={isArchived} />
      )}
      {tab === APP_TAB.hosting && (
        <HostingTab app={app} addKey={keys.addHosting} editKeys={keys.hosting} isReadOnly={isArchived} />
      )}
      {tab === APP_TAB.alerts && <AlertsTable alerts={app.alerts} keys={keys.alerts} />}
      {confirm.element}
    </VStack>
  );
}

function Overview({app}: {app: AppDetail}) {
  return (
    <VStack gap={5}>
      <MetadataList columns="multi" title="Ownership and licence">
        <MetadataListItem label="Owner">{app.owner.name}</MetadataListItem>
        <MetadataListItem label="Backup owner">{app.backupOwner.name}</MetadataListItem>
        <MetadataListItem label="Kind">{KIND_LABEL[app.kind]}</MetadataListItem>
        <MetadataListItem label="Vendor">{orDash(app.vendor)}</MetadataListItem>
        <MetadataListItem label="Category">{orDash(app.category)}</MetadataListItem>
        <MetadataListItem label="Notice deadline">{orDash(app.noticeDeadline)}</MetadataListItem>
        <MetadataListItem label="Renewal date">{orDash(app.renewalDate)}</MetadataListItem>
        <MetadataListItem label="Cost">{formatCost(app.costCents, app.billingCycle)}</MetadataListItem>
      </MetadataList>
      <MetadataList title="Runtime">
        <MetadataListItem label="Where it runs">{orDash(app.runtimeLocation)}</MetadataListItem>
        <MetadataListItem label="Data and keys">{orDash(app.dataAndKeys)}</MetadataListItem>
        <MetadataListItem label="What breaks if it stops">{orDash(app.whatBreaksIfStopped)}</MetadataListItem>
      </MetadataList>
      {app.description && <Text display="block">{app.description}</Text>}
    </VStack>
  );
}
