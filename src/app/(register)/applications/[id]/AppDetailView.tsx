'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {APP_TAB, ROUTES, editAppRoute, type AppTab} from '@/lib/constants';
import type {AppDetail, HostingCatalog} from '@/lib/ui/api-client';
import {COMING_SOON, HEALTH_COMING_SOON, KIND_LABEL, NOT_SET, formatCost, orDash} from '@/lib/ui/copy';
import {BackArrowIcon, PencilIcon} from '@/lib/ui/icons';
import {formatDate, primaryHosting} from '@/lib/ui/register-view';
import {archiveAppAction} from '../../actions';
import {AppIcon, PendingPill, StatusPill} from '../../_components/AppIdentity';
import {ComingSoon, FootNote, KeyValueRows, PanelCard} from '../../_components/Cards';
import {FormError} from '../../_components/FormError';
import {PageFrame} from '../../_components/PageFrame';
import {useAction} from '../../_components/use-action';
import {DependenciesTab} from './DependenciesTab';
import {HostingTab} from './HostingTab';

export type AppDetailKeys = {
  archive: string;
  addDependency: string;
  addHosting: string;
  refreshHosting: string;
  dependencies: Record<string, string>;
  hosting: Record<string, string>;
};

type Props = {app: AppDetail; initialTab: AppTab; keys: AppDetailKeys; catalog: HostingCatalog; today: string};

const NOT_RECORDED = 'Not recorded';
const dateOrDash = (iso: string | null) => (iso ? formatDate(iso) : NOT_SET);

export function AppDetailView({app, initialTab, keys, catalog, today}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<string>(initialTab);
  const confirm = useImperativeAlertDialog();
  const archive = useAction();
  const isArchived = app.archivedAt !== null;
  const hosting = primaryHosting(app.hosting) ?? NOT_RECORDED;

  function askToArchive() {
    confirm.show({
      title: `Archive ${app.name}?`,
      description: 'It leaves the applications list and its scheduled alerts are dropped. Its history stays.',
      actionLabel: 'Archive application',
      onAction: () => {
        confirm.hide();
        archive.run(() => archiveAppAction(keys.archive, app.id), () => router.push(ROUTES.applications));
      },
    });
  }

  return (
    <PageFrame crumbs={[{label: 'Applications', href: ROUTES.applications}, {label: app.name}]}>
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center">
          <Link href={ROUTES.applications} size="sm" weight="bold">
            <HStack gap={1} vAlign="center" as="span">
              <Icon icon={BackArrowIcon} size="xsm" />
              All applications
            </HStack>
          </Link>
          {!isArchived && (
            <HStack gap={2}>
              <Button label="Archive" variant="ghost" isLoading={archive.isPending} onClick={askToArchive} />
              <Button label="Edit application" icon={<Icon icon={PencilIcon} />} href={editAppRoute(app.id)} />
            </HStack>
          )}
        </HStack>
        {isArchived && (
          <Banner status="info" title="Archived" description={`Archived on ${dateOrDash(app.archivedAt)}. Kept as history.`} collapsible={false} />
        )}
        <FormError error={archive.error} />
        <Hero app={app} hosting={hosting} />
      </VStack>

      <VStack gap={4}>
        <TabList value={tab} onChange={setTab} role="tablist" hasDivider>
          <Tab value={APP_TAB.overview} label="Overview" />
          <Tab value={APP_TAB.dependencies} label="Dependencies" />
          <Tab value={APP_TAB.hosting} label="Hosting & infrastructure" />
          <Tab value={APP_TAB.licence} label="Licence & pricing" />
        </TabList>
        {tab === APP_TAB.overview && <OverviewTab app={app} hosting={hosting} />}
        {tab === APP_TAB.dependencies && (
          <DependenciesTab app={app} addKey={keys.addDependency} editKeys={keys.dependencies} isReadOnly={isArchived} />
        )}
        {tab === APP_TAB.hosting && (
          <HostingTab
            app={app}
            catalog={catalog}
            today={today}
            addKey={keys.addHosting}
            refreshKey={keys.refreshHosting}
            editKeys={keys.hosting}
            isReadOnly={isArchived}
          />
        )}
        {tab === APP_TAB.licence && <LicenceTab app={app} />}
      </VStack>
      {confirm.element}
    </PageFrame>
  );
}

function Hero({app, hosting}: {app: AppDetail; hosting: string}) {
  const meta = [
    {label: 'Category', value: orDash(app.category)},
    {label: 'Owner', value: app.owner.name},
    {label: 'Renewal date', value: dateOrDash(app.renewalDate)},
    {label: 'Hosting', value: hosting},
  ];
  return (
    <Card padding={6}>
      <VStack gap={6}>
        <HStack gap={4} hAlign="between" vAlign="center">
          <HStack gap={4} vAlign="center">
            <AppIcon name={app.name} size="lg" />
            <VStack gap={0.5}>
              <Heading level={1}>
                {app.name}
              </Heading>
              <Text color="secondary">{app.description ?? NOT_SET}</Text>
              <HStack gap={2} paddingBlockStart={2}>
                <Badge label={KIND_LABEL[app.kind]} variant="purple" />
                {app.vendor && <Badge label={app.vendor} variant="neutral" />}
              </HStack>
            </VStack>
          </HStack>
          <VStack gap={1} hAlign="start">
            <Text type="supporting" color="secondary">
              HEALTH SCORE
            </Text>
            <Text type="display-3" color="secondary">
              {NOT_SET}
            </Text>
            <Badge label={COMING_SOON} variant="neutral" />
          </VStack>
        </HStack>
        <VStack gap={5}>
          <Divider />
          <Grid columns={4} gap={4}>
            {meta.map((item) => (
              <VStack key={item.label} gap={1}>
                <Text type="supporting" color="secondary">
                  {item.label}
                </Text>
                <Text weight="bold" size="sm">
                  {item.value}
                </Text>
              </VStack>
            ))}
          </Grid>
        </VStack>
      </VStack>
    </Card>
  );
}

function OverviewTab({app, hosting}: {app: AppDetail; hosting: string}) {
  return (
    <Grid columns={12} gap={4} align="start">
      <GridSpan columns={7}>
        <VStack gap={4}>
          <PanelCard title="Health breakdown" subtitle="How the 0–100 score is calculated">
            <ComingSoon
              title={HEALTH_COMING_SOON}
              description="Scores will be worked out from dependencies, hosting, licence and pricing checks."
            />
          </PanelCard>
        </VStack>
      </GridSpan>
      <GridSpan columns={5}>
        <VStack gap={4}>
          <PanelCard title="Current status" subtitle="Status by monitored dimension">
            <KeyValueRows
              isLabelStrong
              rows={[
                {label: 'Dependencies', value: <PendingPill />},
                {label: 'Hosting & infrastructure', value: <StatusPill status={app.hostingHealth.status} />},
                {label: 'Licence', value: <PendingPill />},
                {label: 'Pricing', value: <PendingPill />},
              ]}
            />
          </PanelCard>
          <PanelCard title="Key details" subtitle="Application record">
            <KeyValueRows
              rows={[
                {label: 'Vendor', value: orDash(app.vendor)},
                {label: 'Type', value: KIND_LABEL[app.kind]},
                {label: 'Owner', value: app.owner.name},
                {label: 'Backup owner', value: app.backupOwner.name},
                {label: 'Category', value: orDash(app.category)},
                {label: 'Hosting', value: hosting},
                {label: 'Renewal', value: dateOrDash(app.renewalDate)},
                {label: 'Notice deadline', value: dateOrDash(app.noticeDeadline)},
                {label: 'Monitoring', value: <Badge label="Not configured" variant="purple" />},
              ]}
            />
          </PanelCard>
        </VStack>
      </GridSpan>
    </Grid>
  );
}

function LicenceTab({app}: {app: AppDetail}) {
  return (
    <PanelCard title="Licence & pricing" subtitle="Renewal details, notice deadlines and vendor pricing changes">
      <VStack gap={3}>
        <KeyValueRows
          rows={[
            {label: 'Vendor', value: orDash(app.vendor)},
            {label: 'Renewal date', value: dateOrDash(app.renewalDate)},
            {label: 'Notice deadline', value: dateOrDash(app.noticeDeadline)},
            {label: 'Billing cycle', value: orDash(app.billingCycle)},
            {label: 'Cost', value: formatCost(app.costCents, null)},
            {label: 'Licence status', value: <PendingPill />},
            {label: 'Pricing status', value: <PendingPill />},
          ]}
        />
        <FootNote>Licence and pricing checks are coming soon. Change dates and cost with Edit application.</FootNote>
      </VStack>
    </PanelCard>
  );
}
