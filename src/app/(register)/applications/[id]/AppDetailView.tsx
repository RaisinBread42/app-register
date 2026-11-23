'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {APP_TAB, HEALTH_MAX_SCORE, ROUTES, editAppRoute, type AppTab} from '@/lib/constants';
import type {AppDetail, Deduction, Health, HostingCatalog} from '@/lib/ui/api-client';
import {
  HEALTH_BASIS_NOTE,
  HEALTH_STATUS_VARIANT,
  KIND_LABEL,
  NO_SCORE_HINT,
  NO_SCORE_TITLE,
  NOT_SET,
  formatCost,
  healthVerdict,
  orDash,
} from '@/lib/ui/copy';
import {BackArrowIcon, PencilIcon} from '@/lib/ui/icons';
import {formatDate, primaryHosting} from '@/lib/ui/register-view';
import {archiveAppAction} from '../../actions';
import {AppIcon, PendingPill} from '../../_components/AppIdentity';
import {FootNote, KeyValueRows, PanelCard} from '../../_components/Cards';
import {DimensionPill, STATUS_TEXT_COLOR, ScorePill} from '../../_components/Health';
import {FormError} from '../../_components/FormError';
import {PageFrame} from '../../_components/PageFrame';
import {useAction} from '../../_components/use-action';
import {DependenciesTab} from './DependenciesTab';
import {HostingTab} from './HostingTab';

export type AppDetailKeys = {
  archive: string;
  addDependency: string;
  importDependencies: string;
  addHosting: string;
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
          <DependenciesTab
            app={app}
            addKey={keys.addDependency}
            importKey={keys.importDependencies}
            editKeys={keys.dependencies}
            isReadOnly={isArchived}
          />
        )}
        {tab === APP_TAB.hosting && (
          <HostingTab
            app={app}
            catalog={catalog}
            today={today}
            addKey={keys.addHosting}
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
          <HeroScore health={app.health} />
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

/** The prototype's hero score: a label, the big coloured number "/ 100", and a Healthy / Needs attention badge. */
function HeroScore({health}: {health: Health}) {
  const variant = HEALTH_STATUS_VARIANT[health.status];
  return (
    <VStack gap={1} hAlign="start">
      <Text type="supporting" color="secondary">
        HEALTH SCORE
      </Text>
      <HStack gap={1} vAlign="end" style={{color: STATUS_TEXT_COLOR[variant]}}>
        <Text type="display-3" color="inherit">
          {health.score ?? NOT_SET}
        </Text>
        {health.score !== null && (
          <Text size="lg" weight="medium" color="secondary">
            {`/ ${HEALTH_MAX_SCORE}`}
          </Text>
        )}
      </HStack>
      <Badge label={health.score === null ? NO_SCORE_TITLE : healthVerdict(health.score)} variant={variant} />
      <Text type="supporting" color="secondary">
        {HEALTH_BASIS_NOTE}
      </Text>
    </VStack>
  );
}

/** The prototype's deductions list: the starting score, each deduction with its points, then the score. */
function HealthBreakdown({health}: {health: Health}) {
  if (health.score === null) {
    return <EmptyState title={NO_SCORE_TITLE} description={NO_SCORE_HINT} isCompact />;
  }
  const deductions = Object.values(health.dimensions)
    .flatMap((dimension) => dimension?.deductions ?? [])
    .sort((a, b) => b.points - a.points);
  return (
    <VStack gap={0}>
      <BreakdownRow title="Starting score" detail="Every monitored check starts clear">
        <Text weight="bold" size="sm">{`${HEALTH_MAX_SCORE} pts`}</Text>
      </BreakdownRow>
      {deductions.map((deduction) => (
        <DeductionRow key={`${deduction.label} ${deduction.detail}`} deduction={deduction} />
      ))}
      {deductions.length === 0 && (
        <BreakdownRow title="No active deductions">
          <HStack style={{color: STATUS_TEXT_COLOR.green}}>
            <Text color="inherit" weight="bold">
              ✓
            </Text>
          </HStack>
        </BreakdownRow>
      )}
      <BreakdownRow title="Current health score">
        <ScorePill health={health} />
      </BreakdownRow>
      <FootNote>{HEALTH_BASIS_NOTE}</FootNote>
    </VStack>
  );
}

function DeductionRow({deduction}: {deduction: Deduction}) {
  return (
    <BreakdownRow title={deduction.label} detail={deduction.detail}>
      <HStack style={{color: STATUS_TEXT_COLOR.red, flex: 'none'}}>
        <Text color="inherit" weight="bold" size="sm">{`−${deduction.points} pts`}</Text>
      </HStack>
    </BreakdownRow>
  );
}

function BreakdownRow({title, detail, children}: {title: string; detail?: string; children: React.ReactNode}) {
  return (
    <VStack gap={0}>
      <HStack gap={3} hAlign="between" vAlign="center" paddingBlock={3}>
        <VStack gap={0.5}>
          <Text weight="bold" size="sm">
            {title}
          </Text>
          {detail && (
            <Text type="supporting" color="secondary">
              {detail}
            </Text>
          )}
        </VStack>
        {children}
      </HStack>
      <Divider />
    </VStack>
  );
}

function OverviewTab({app, hosting}: {app: AppDetail; hosting: string}) {
  return (
    <Grid columns={12} gap={4} align="start">
      <GridSpan columns={7}>
        <VStack gap={4}>
          <PanelCard title="Health breakdown" subtitle="How the 0–100 score is calculated">
            <HealthBreakdown health={app.health} />
          </PanelCard>
        </VStack>
      </GridSpan>
      <GridSpan columns={5}>
        <VStack gap={4}>
          <PanelCard title="Current status" subtitle="Status by monitored dimension">
            <KeyValueRows
              isLabelStrong
              rows={[
                {label: 'Dependencies', value: <DimensionPill dimension={app.health.dimensions.dependencies} />},
                {label: 'Hosting & infrastructure', value: <DimensionPill dimension={app.health.dimensions.hosting} />},
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
