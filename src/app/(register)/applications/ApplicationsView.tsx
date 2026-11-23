'use client';

import {useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack} from '@astryxdesign/core/HStack';
import {Selector} from '@astryxdesign/core/Selector';
import {Table, proportional} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {
  APP_LIST_SORT,
  APP_LIST_SORTS,
  FILTER_ALL,
  HEALTH_ATTENTION_BELOW,
  HEALTH_MAX_SCORE,
  type AppListSort,
} from '@/lib/constants';
import type {App} from '@/lib/ui/api-client';
import {
  APP_LIST_SORT_LABEL,
  COMING_SOON,
  HEALTH_BASIS_NOTE,
  HEALTH_FILTER_OPTIONS,
  KIND_LABEL,
  KIND_OPTIONS,
  LIVE_DATA_NOTE,
  NOT_SET,
} from '@/lib/ui/copy';
import {AppsIcon, CalendarIcon, ShieldIcon, WarningIcon} from '@/lib/ui/icons';
import {applyAppListView, appsWithRenewal, formatDate, healthStats} from '@/lib/ui/register-view';
import {AppCell, PendingPill} from '../_components/AppIdentity';
import {FootNote, MetricCard} from '../_components/Cards';
import {DimensionPill, ScorePill} from '../_components/Health';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';
import {AddApplicationDialog} from './AddApplicationDialog';
import type {PersonOption} from './AppForm';

/** Column shares as the prototype's table lays them out at 1440px. */
const column = (share: number) => proportional(share, {minWidth: 80});

const TYPE_FILTERS = [{value: FILTER_ALL, label: 'All types'}, ...KIND_OPTIONS];
const SORT_OPTIONS = APP_LIST_SORTS.map((sort) => ({value: sort, label: APP_LIST_SORT_LABEL[sort]}));

type Props = {apps: App[]; people: PersonOption[]; addKey: string; initialQuery: string; isAddOpen: boolean};

export function ApplicationsView({apps, people, addKey, initialQuery, isAddOpen}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<string>(FILTER_ALL);
  const [health, setHealth] = useState<string>(FILTER_ALL);
  const [sort, setSort] = useState<AppListSort>(APP_LIST_SORT.health);
  const [isAdding, setIsAdding] = useState(isAddOpen);
  const shown = applyAppListView(apps, {query, kind, health, sort});
  const stats = healthStats(apps);

  return (
    <PageFrame crumbs={[{label: 'Applications'}]}>
      <PageHeader
        title="Applications"
        description="Your company’s application inventory, health and key dates."
        actions={<Button label="+ Add application" variant="primary" onClick={() => setIsAdding(true)} />}
      />
      <Grid columns={4} gap={4}>
        <MetricCard label="Total applications" value={apps.length} description="All tracked applications" icon={AppsIcon} />
        <MetricCard
          label="Average health"
          value={stats.average === null ? NOT_SET : `${stats.average} / ${HEALTH_MAX_SCORE}`}
          description={HEALTH_BASIS_NOTE}
          icon={ShieldIcon}
          tone="green"
        />
        <MetricCard
          label="Need attention"
          value={stats.needAttention}
          description={`Applications below ${HEALTH_ATTENTION_BELOW}`}
          icon={WarningIcon}
          tone="red"
        />
        <MetricCard label="With licence dates" value={appsWithRenewal(apps).length} description="Tracked renewals" icon={CalendarIcon} tone="amber" />
      </Grid>
      <Card padding={0}>
        <VStack gap={0}>
          <HStack gap={2} paddingInline={4} paddingBlockStart={4} paddingBlockEnd={6} vAlign="center" wrap="wrap">
            <TextInput
              label="Search applications"
              isLabelHidden
              placeholder="Search applications…"
              value={query}
              onChange={setQuery}
              width={338}
            />
            <Selector label="Type" isLabelHidden options={TYPE_FILTERS} value={kind} onChange={(value) => setKind(value ?? FILTER_ALL)} width={180} />
            <Selector
              label="Health"
              isLabelHidden
              options={HEALTH_FILTER_OPTIONS}
              value={health}
              onChange={(value) => setHealth(value ?? FILTER_ALL)}
              width={142}
            />
            <HStack gap={0} style={{flex: 1}} />
            <Selector
              label="Sort by"
              isLabelHidden
              options={SORT_OPTIONS}
              value={sort}
              onChange={(value) => setSort((value as AppListSort | null) ?? APP_LIST_SORT.health)}
              width={158}
            />
          </HStack>
          <Table
            data={shown}
            idKey="id"
            hasHover
            emptyState={<EmptyState title="No applications match your filters." isCompact />}
            columns={[
              {key: 'name', header: 'Application', width: proportional(198, {minWidth: 190}), renderCell: (app: App) => <AppCell app={app} />},
              {key: 'kind', width: column(135), header: 'Type', renderCell: (app: App) => <Badge label={KIND_LABEL[app.kind]} variant="purple" />},
              {key: 'owner', width: column(124), header: 'Owner', renderCell: (app: App) => app.owner.name},
              {key: 'health', width: column(92), header: 'Health ↑', renderCell: (app: App) => <ScorePill health={app.health} />},
              {
                key: 'dependencies',
                width: column(112),
                header: 'Dependencies',
                renderCell: (app: App) => <DimensionPill dimension={app.health.dimensions.dependencies} />,
              },
              {key: 'hosting', width: column(100), header: 'Hosting', renderCell: () => <PendingPill />},
              {key: 'licence', width: column(100), header: 'Licence', renderCell: () => <PendingPill />},
              {key: 'pricing', width: column(100), header: 'Pricing', renderCell: () => <PendingPill />},
              {
                key: 'renewalDate',
                width: column(105),
                header: 'Renewal',
                renderCell: (app: App) => (app.renewalDate ? formatDate(app.renewalDate) : NOT_SET),
              },
            ]}
          />
          <HStack paddingInline={4} paddingBlock={4}>
            <Text type="supporting" color="secondary">
              {`Showing ${shown.length} of ${apps.length} applications · Click an application to open details`}
            </Text>
          </HStack>
        </VStack>
      </Card>
      <FootNote>{`${LIVE_DATA_NOTE} Statuses shown as — have nothing recorded to check, or are ${COMING_SOON.toLowerCase()}.`}</FootNote>
      <AddApplicationDialog isOpen={isAdding} onClose={() => setIsAdding(false)} idempotencyKey={addKey} people={people} />
    </PageFrame>
  );
}
