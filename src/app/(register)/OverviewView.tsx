'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {OVERVIEW_LIST_LIMIT, ROUTES} from '@/lib/constants';
import type {App} from '@/lib/ui/api-client';
import {HEALTH_COMING_SOON, MONITORING_COMING_SOON, NOT_SET} from '@/lib/ui/copy';
import {AppsIcon, CalendarIcon, CheckIcon, ShieldIcon, WarningIcon} from '@/lib/ui/icons';
import {appsWithRenewal, upcomingNoticeDeadlines} from '@/lib/ui/register-view';
import {CardLink, ComingSoon, MetricCard, PanelCard} from './_components/Cards';
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

  return (
    <PageFrame crumbs={[{label: 'Overview'}]}>
      <PageHeader
        title="Overview"
        description="Your application inventory, health and upcoming obligations."
        actions={<Button label="+ Add application" variant="primary" onClick={() => setIsAdding(true)} />}
      />
      <Grid columns={11} gap={4}>
        <GridSpan columns={3}>
          <MetricCard label="Average health score" value={NOT_SET} description={HEALTH_COMING_SOON} icon={ShieldIcon} tone="green" />
        </GridSpan>
        <GridSpan columns={2}>
          <MetricCard label="Total applications" value={apps.length} description="SaaS and custom" icon={AppsIcon} />
        </GridSpan>
        <GridSpan columns={2}>
          <MetricCard label="Healthy applications" value={NOT_SET} description={HEALTH_COMING_SOON} icon={CheckIcon} tone="green" />
        </GridSpan>
        <GridSpan columns={2}>
          <MetricCard label="Upcoming renewals" value={renewals.length} description="Scheduled licence dates" icon={CalendarIcon} tone="amber" />
        </GridSpan>
        <GridSpan columns={2}>
          <MetricCard label="Need attention" value={NOT_SET} description={HEALTH_COMING_SOON} icon={WarningIcon} tone="red" />
        </GridSpan>
      </Grid>
      <Grid columns={11} gap={4} align="start">
        <GridSpan columns={7}>
          <VStack gap={4}>
            <PanelCard
              title="Applications needing attention"
              subtitle="Lowest health scores first"
              action={<CardLink label="View all applications" href={ROUTES.applications} />}>
              <ComingSoon title={HEALTH_COMING_SOON} description="Applications will be ranked here by their health score." />
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
              <ComingSoon title={HEALTH_COMING_SOON} description="The spread of scores will show here." />
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
              action={<CardLink label="View sources" href={ROUTES.sources} />}>
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
