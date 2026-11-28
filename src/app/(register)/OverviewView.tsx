'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {Badge} from '@astryxdesign/core/Badge';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Table, proportional} from '@astryxdesign/core/Table';
import {HEALTH_ATTENTION_BELOW, HEALTH_MAX_SCORE, HEALTH_STATUS, OVERVIEW_LIST_LIMIT, ROUTES, SETTINGS_SECTION, appRoute, settingsRoute, type HealthStatus} from '@/lib/constants';
import type {App} from '@/lib/ui/api-client';
import {DIMENSION_LABEL, HEALTH_BASIS_NOTE, HEALTH_STATUS_VARIANT, MONITORING_COMING_SOON, NO_SCORE_HINT, NO_SCORE_TITLE, NOT_SET} from '@/lib/ui/copy';
import {AppsIcon, ArrowIcon, CalendarIcon, CheckIcon, ShieldIcon, WarningIcon} from '@/lib/ui/icons';
import {appsNeedingAttention, appsWithRenewal, healthDistribution, healthStats, upcomingNoticeDeadlines} from '@/lib/ui/register-view';
import {AppCell} from './_components/AppIdentity';
import {CardLink, FootNote, MetricCard, PanelCard} from './_components/Cards';
import {ScorePill} from './_components/Health';
import {DateList} from './_components/DateList';
import {PageFrame} from './_components/PageFrame';
import {PageHeader} from './_components/PageHeader';
import {AddApplicationDialog} from './applications/AddApplicationDialog';
import type {PersonOption} from './applications/AppForm';

type Props = {apps: App[]; people: PersonOption[]; addKey: string; today: string};

export function OverviewView({apps, people, addKey, today}: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const renewals = appsWithRenewal(apps);
  const deadlines = upcomingNoticeDeadlines(apps, today);
  const stats = healthStats(apps);

  return (
    <PageFrame crumbs={[{label: 'Overview'}]}>
      <PageHeader
        title="Overview"
        description="Your application inventory, health and upcoming obligations."
        actions={<Button label="+ Add application" variant="primary" onClick={() => setIsAdding(true)} />}
      />
      <Grid columns={11} gap={4}>
        <GridSpan columns={3}>
          <MetricCard
            label="Average health score"
            value={
              stats.average === null ? (
                NOT_SET
              ) : (
                <>
                  {stats.average}
                  <Text size="lg" weight="medium" color="secondary">{` / ${HEALTH_MAX_SCORE}`}</Text>
                </>
              )
            }
            description={HEALTH_BASIS_NOTE}
            icon={ShieldIcon}
            tone="green"
          />
        </GridSpan>
        <GridSpan columns={2}>
          <MetricCard label="Total applications" value={apps.length} description="SaaS and custom" icon={AppsIcon} />
        </GridSpan>
        <GridSpan columns={2}>
          <MetricCard
            label="Healthy applications"
            value={stats.healthy}
            description={`Score of ${HEALTH_ATTENTION_BELOW} or above`}
            icon={CheckIcon}
            tone="green"
          />
        </GridSpan>
        <GridSpan columns={2}>
          <MetricCard label="Upcoming renewals" value={renewals.length} description="Scheduled licence dates" icon={CalendarIcon} tone="amber" />
        </GridSpan>
        <GridSpan columns={2}>
          <MetricCard
            label="Need attention"
            value={stats.needAttention}
            description={`Health score below ${HEALTH_ATTENTION_BELOW}`}
            icon={WarningIcon}
            tone="red"
          />
        </GridSpan>
      </Grid>
      <Grid columns={11} gap={4} align="start">
        <GridSpan columns={7}>
          <VStack gap={4}>
            <PanelCard
              title="Applications needing attention"
              subtitle="Lowest health scores first"
              action={<CardLink label="View all applications" href={ROUTES.applications} />}
              isFlush>
              <NeedingAttention apps={apps} hasScores={stats.average !== null} />
            </PanelCard>
            <PanelCard title="Upcoming notice deadlines" subtitle="Last days to give notice before a renewal">
              <DateList
                rows={deadlines.slice(0, OVERVIEW_LIST_LIMIT).map((app) => ({
                  appId: app.id,
                  title: `${app.name} notice deadline`,
                  date: app.noticeDeadline ?? '',
                }))}
                badge="Notice"
                emptyTitle="No upcoming notice deadlines"
              />
            </PanelCard>
          </VStack>
        </GridSpan>
        <GridSpan columns={4}>
          <VStack gap={4}>
            <PanelCard title="Health distribution" subtitle="Across the entire application catalog">
              <HealthDistribution apps={apps} />
            </PanelCard>
            <PanelCard title="Upcoming renewals" subtitle="Licence and subscription dates">
              <DateList
                rows={renewals.slice(0, OVERVIEW_LIST_LIMIT).map((app) => ({
                  appId: app.id,
                  title: `${app.name} renewal`,
                  date: app.renewalDate ?? '',
                }))}
                badge="Renewal"
                emptyTitle="No renewal dates recorded"
              />
            </PanelCard>
            <PanelCard
              title="Monitoring coverage"
              subtitle="Source health at a glance"
              action={<CardLink label="View sources" href={settingsRoute(SETTINGS_SECTION.sources)} />}>
              <HStack gap={4} vAlign="center">
                <Text type="display-3" color="secondary">
                  {NOT_SET}
                </Text>
                <VStack gap={0.5}>
                  <Text weight="bold" size="sm">
                    Sources checking successfully
                  </Text>
                  <Text type="supporting" color="secondary">
                    {`${MONITORING_COMING_SOON}.`}
                  </Text>
                </VStack>
              </HStack>
            </PanelCard>
          </VStack>
        </GridSpan>
      </Grid>
      <AddApplicationDialog isOpen={isAdding} onClose={() => setIsAdding(false)} idempotencyKey={addKey} people={people} />
    </PageFrame>
  );
}

/** The prototype's "Applications needing attention" table: lowest scores first, with each app's biggest deduction. */
function NeedingAttention({apps, hasScores}: {apps: App[]; hasScores: boolean}) {
  const rows = appsNeedingAttention(apps).slice(0, OVERVIEW_LIST_LIMIT);
  return (
    <Table
      data={rows}
      idKey="id"
      hasHover
      emptyState={
        hasScores ? (
          <EmptyState title="No applications need attention" description="Every scored application is at full health." isCompact />
        ) : (
          <EmptyState title={NO_SCORE_TITLE} description={NO_SCORE_HINT} isCompact />
        )
      }
      columns={[
        {key: 'name', header: 'Application', width: proportional(5, {minWidth: 190}), renderCell: (app: App) => <AppCell app={app} />},
        {key: 'health', header: 'Health', width: proportional(2, {minWidth: 80}), renderCell: (app: App) => <ScorePill health={app.health} />},
        {key: 'issue', header: 'Key issue', width: proportional(7, {minWidth: 200}), renderCell: (app: App) => <KeyIssue app={app} />},
        {
          key: 'open',
          header: '',
          width: proportional(1, {minWidth: 40}),
          renderCell: (app: App) => (
            <Link href={appRoute(app.id)} label={`Open ${app.name}`}>
              <Icon icon={ArrowIcon} size="sm" />
            </Link>
          ),
        },
      ]}
    />
  );
}

/** The app's largest deduction: which dimension, and what it is. */
function KeyIssue({app}: {app: App}) {
  const [worst] = Object.values(app.health.dimensions)
    .flatMap((dimension) => dimension?.deductions ?? [])
    .sort((a, b) => b.points - a.points);
  if (!worst) {
    return NOT_SET;
  }
  return (
    <VStack gap={1} hAlign="start">
      <Badge label={DIMENSION_LABEL[worst.dimension]} variant={HEALTH_STATUS_VARIANT[app.health.status]} />
      <Text type="supporting" color="secondary">
        {worst.label}
      </Text>
    </VStack>
  );
}

const BAR_VARIANT: Record<HealthStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  [HEALTH_STATUS.ok]: 'success',
  [HEALTH_STATUS.attention]: 'warning',
  [HEALTH_STATUS.critical]: 'error',
  [HEALTH_STATUS.na]: 'neutral',
};

/** The prototype's three bars: how many scored apps sit in each score band. */
function HealthDistribution({apps}: {apps: App[]}) {
  const bands = healthDistribution(apps);
  const scored = bands.reduce((total, band) => total + band.count, 0);
  if (scored === 0) {
    return <EmptyState title={NO_SCORE_TITLE} description={NO_SCORE_HINT} isCompact />;
  }
  return (
    <VStack gap={3}>
      {bands.map((band) => (
        <HStack key={band.range} gap={3} vAlign="center">
          <Text size="sm" style={{width: 'var(--spacing-16)', flex: 'none'}}>
            {band.range}
          </Text>
          <HStack gap={0} style={{flex: 1}}>
            <ProgressBar label={`Applications scoring ${band.range}`} isLabelHidden value={band.count} max={scored} variant={BAR_VARIANT[band.status]} />
          </HStack>
          <Text size="sm" weight="bold">
            {band.count}
          </Text>
        </HStack>
      ))}
      <FootNote>{HEALTH_BASIS_NOTE}</FootNote>
    </VStack>
  );
}
