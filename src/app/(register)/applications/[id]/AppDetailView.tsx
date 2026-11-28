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
import {APP_TAB, HEALTH_MAX_SCORE, ROUTES, appTabRoute, editAppRoute, type AppTab} from '@/lib/constants';
import type {AppDetail, AuditEvent, Deduction, Health, HostingCatalog, Notice} from '@/lib/ui/api-client';
import {
  CRITICALITY_LABEL,
  CRITICALITY_NOT_SET,
  ENVIRONMENT_LABEL,
  HEALTH_BASIS_NOTE,
  HEALTH_STATUS_VARIANT,
  KIND_LABEL,
  MATCH_STATUS_LABEL,
  NO_BACKUP_OWNER,
  NO_SCORE_HINT,
  NO_SCORE_TITLE,
  NOT_SET,
  NOTICE_CATEGORY_LABEL,
  NOTICE_SEVERITY_LABEL,
  NOTICE_SEVERITY_VARIANT,
  formatCost,
  healthVerdict,
  orDash,
} from '@/lib/ui/copy';
import {BackArrowIcon, PencilIcon} from '@/lib/ui/icons';
import {useRememberedListHref} from '@/lib/ui/list-memory';
import {DEFAULT_INBOX_VIEW, inboxQuery, inboxRows} from '@/lib/ui/notice-inbox';
import {activitySummary} from '@/lib/ui/activity';
import {allDeductions, formatDate, formatDateTime, latestCheck, primaryHosting} from '@/lib/ui/register-view';
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

type Props = {app: AppDetail; notices: Notice[]; activity: AuditEvent[]; initialTab: AppTab; keys: AppDetailKeys; catalog: HostingCatalog; today: string};

const NOT_RECORDED = 'Not recorded';
/** The breakdown shows the biggest deductions first, with the rest behind "See scoring details" (spec §8). */
const TOP_DEDUCTIONS = 3;
const dateOrDash = (iso: string | null) => (iso ? formatDate(iso) : NOT_SET);

export function AppDetailView({app, notices, activity, initialTab, keys, catalog, today}: Props) {
  const router = useRouter();
  const [tab, setTabState] = useState<string>(initialTab);
  /** The open tab lives in the URL, so a link or Back opens the same tab. */
  const setTab = (value: string) => {
    setTabState(value);
    router.replace(appTabRoute(app.id, value as AppTab), {scroll: false});
  };
  /** Back to the list as the user left it (filters, search, sort); the plain list until known. */
  const listHref = useRememberedListHref();
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
    <PageFrame crumbs={[{label: 'Applications', href: listHref}, {label: app.name}]}>
      <VStack gap={4}>
        <HStack hAlign="between" vAlign="center">
          <Link href={listHref} size="sm" weight="bold">
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
          <Tab value={APP_TAB.licence} label="Licences" />
          <Tab value={APP_TAB.activity} label="Activity" />
        </TabList>
        {tab === APP_TAB.overview && <OverviewTab app={app} hosting={hosting} notices={notices} />}
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
        {tab === APP_TAB.activity && <ActivityTab events={activity} />}
      </VStack>
      {confirm.element}
    </PageFrame>
  );
}

function Hero({app, hosting}: {app: AppDetail; hosting: string}) {
  const checked = latestCheck(app);
  const meta = [
    {label: 'Owner', value: app.owner.name},
    {label: 'Backup owner', value: app.backupOwner?.name ?? NO_BACKUP_OWNER},
    {label: 'Criticality', value: app.criticality ? CRITICALITY_LABEL[app.criticality] : CRITICALITY_NOT_SET},
    {label: 'Environments', value: app.environments.length ? app.environments.map((environment) => ENVIRONMENT_LABEL[environment]).join(', ') : NOT_SET},
    {label: 'Last checked', value: checked ? formatDateTime(checked) : 'Never checked'},
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
          <Grid columns={3} gap={4}>
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
function HealthBreakdown({health, limit}: {health: Health; limit?: number}) {
  if (health.score === null) {
    return <EmptyState title={NO_SCORE_TITLE} description={NO_SCORE_HINT} isCompact />;
  }
  const deductions = allDeductions(health).slice(0, limit);
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

function OverviewTab({app, hosting, notices}: {app: AppDetail; hosting: string; notices: Notice[]}) {
  const [showAllDeductions, setShowAllDeductions] = useState(false);
  const deductions = allDeductions(app.health);
  const rows = inboxRows(notices, DEFAULT_INBOX_VIEW).filter((row) => row.match.app.id === app.id);
  return (
    <Grid columns={12} gap={4} align="start">
      <GridSpan columns={7}>
        <VStack gap={4}>
          <PanelCard title="Needs attention" subtitle="Open notices on this application, most severe first">
            {rows.length === 0 ? (
              <EmptyState title="No open notices" description="Snoozed and handled notices are in the Notices inbox." isCompact />
            ) : (
              <VStack gap={0}>
                {rows.map(({notice, match}, index) => (
                  <VStack key={match.id} gap={0}>
                    {index > 0 && <Divider />}
                    <HStack gap={3} vAlign="center" hAlign="between" paddingBlock={3} wrap="wrap">
                      <HStack gap={3} vAlign="center" style={{flex: 1, minWidth: 0}}>
                        <Badge label={NOTICE_SEVERITY_LABEL[notice.severity]} variant={NOTICE_SEVERITY_VARIANT[notice.severity]} />
                        <VStack gap={0.5}>
                          <Text weight="bold" size="sm">
                            {notice.title}
                          </Text>
                          <Text type="supporting" color="secondary">
                            {`${NOTICE_CATEGORY_LABEL[notice.category]} · ${MATCH_STATUS_LABEL[match.status]}`}
                          </Text>
                        </VStack>
                      </HStack>
                      <Button label="Review notice" size="sm" href={`${ROUTES.notices}${inboxQuery({...DEFAULT_INBOX_VIEW, notice: match.id})}`} />
                    </HStack>
                  </VStack>
                ))}
              </VStack>
            )}
          </PanelCard>
          <PanelCard
            title="Health breakdown"
            subtitle={showAllDeductions ? 'Every deduction behind the score' : 'The three biggest deductions'}
            action={
              deductions.length > TOP_DEDUCTIONS ? (
                <Button
                  label={showAllDeductions ? 'Show the top three' : 'See scoring details'}
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllDeductions((current) => !current)}
                />
              ) : undefined
            }>
            <HealthBreakdown health={app.health} limit={showAllDeductions ? undefined : TOP_DEDUCTIONS} />
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
                {label: 'Supplier', value: orDash(app.vendor)},
                {label: 'Type', value: KIND_LABEL[app.kind]},
                {label: 'Category', value: orDash(app.category)},
                {
                  label: 'Repository',
                  value: app.repositoryUrl ? (
                    <Link href={app.repositoryUrl} target="_blank" rel="noopener noreferrer">
                      {app.repositoryUrl}
                    </Link>
                  ) : (
                    NOT_SET
                  ),
                },
                {label: 'Hosting', value: hosting},
                {label: 'Renewal', value: dateOrDash(app.renewalDate)},
                {label: 'Notice deadline', value: dateOrDash(app.noticeDeadline)},
                {label: 'Where it runs', value: orDash(app.runtimeLocation)},
                {label: 'Data and keys it touches', value: orDash(app.dataAndKeys)},
                {label: 'What breaks if it stops', value: orDash(app.whatBreaksIfStopped)},
              ]}
            />
          </PanelCard>
        </VStack>
      </GridSpan>
    </Grid>
  );
}

/** Everything done to this application and its notices, newest first (append-only history). */
function ActivityTab({events}: {events: AuditEvent[]}) {
  return (
    <PanelCard title="Activity" subtitle="Who did what, and when; this history is never rewritten">
      {events.length === 0 ? (
        <EmptyState title="No activity yet" description="Actions on this application and its notices show here." isCompact />
      ) : (
        <VStack gap={0}>
          {events.map((event, index) => (
            <VStack key={event.id} gap={0}>
              {index > 0 && <Divider />}
              <VStack gap={0.5} paddingBlock={3}>
                <Text size="sm">{activitySummary(event)}</Text>
                <Text type="supporting" color="secondary">
                  {[formatDateTime(event.occurredAt), event.note].filter(Boolean).join(' · ')}
                </Text>
              </VStack>
            </VStack>
          ))}
        </VStack>
      )}
    </PanelCard>
  );
}

function LicenceTab({app}: {app: AppDetail}) {
  return (
    <PanelCard title="Licence & pricing" subtitle="Renewal details, notice deadlines and vendor pricing changes">
      <VStack gap={3}>
        <KeyValueRows
          rows={[
            {label: 'Supplier', value: orDash(app.vendor)},
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
