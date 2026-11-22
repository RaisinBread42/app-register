'use client';

import {useRouter} from 'next/navigation';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Selector} from '@astryxdesign/core/Selector';
import {Table} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {
  API_QUERY,
  APP_SORT,
  APP_SORTS,
  FILTER_ALL,
  NOTICE_ALERT_OFFSET_DAYS,
  ROUTES,
  appRoute,
} from '@/lib/constants';
import type {App, AppListFilter} from '@/lib/ui/api-client';
import {KIND_LABEL, KIND_OPTIONS, SORT_LABEL, orDash} from '@/lib/ui/copy';
import {PageHeader} from '../_components/PageHeader';

const KIND_FILTERS = [{value: FILTER_ALL, label: 'All kinds'}, ...KIND_OPTIONS];
const SORT_OPTIONS = APP_SORTS.map((sort) => ({value: sort, label: SORT_LABEL[sort]}));
const WINDOW_OPTIONS = [
  {value: FILTER_ALL, label: 'Any notice deadline'},
  ...[...NOTICE_ALERT_OFFSET_DAYS].reverse().map((days) => ({value: String(days), label: `Notice due in the next ${days} days`})),
];

export function AppsList({apps, filter}: {apps: App[]; filter: AppListFilter}) {
  const router = useRouter();

  function show(name: string, value: string | null) {
    const current: Record<string, string | undefined> = {
      [API_QUERY.kind]: filter.kind,
      [API_QUERY.sort]: filter.sort,
      [API_QUERY.noticeDeadlineWithinDays]: filter.noticeDeadlineWithinDays?.toString(),
      [name]: value === FILTER_ALL || value === null ? undefined : value,
    };
    const query = new URLSearchParams(Object.entries(current).filter((entry): entry is [string, string] => !!entry[1]));
    router.push(`${ROUTES.apps}?${query}`);
  }

  return (
    <VStack gap={5}>
      <PageHeader
        title="Apps"
        description={`${apps.length} active ${apps.length === 1 ? 'app' : 'apps'}, with owners and notice deadlines.`}
        actions={<Button label="Add app" variant="primary" href={ROUTES.newApp} />}
      />
      <HStack gap={3} vAlign="end" wrap="wrap">
        <Selector
          label="Kind"
          options={KIND_FILTERS}
          value={filter.kind ?? FILTER_ALL}
          onChange={(value) => show(API_QUERY.kind, value)}
          width={220}
        />
        <Selector
          label="Sort by"
          options={SORT_OPTIONS}
          value={filter.sort ?? APP_SORT.name}
          onChange={(value) => show(API_QUERY.sort, value)}
          width={260}
        />
        <Selector
          label="Deadlines"
          options={WINDOW_OPTIONS}
          value={filter.noticeDeadlineWithinDays?.toString() ?? FILTER_ALL}
          onChange={(value) => show(API_QUERY.noticeDeadlineWithinDays, value)}
          width={280}
        />
      </HStack>
      <Table
        data={apps}
        idKey="id"
        hasHover
        density="compact"
        emptyState={
          <EmptyState
            title="No apps match"
            description="Change the filters, or add the first app to the register."
            isCompact
          />
        }
        columns={[
          {
            key: 'name',
            header: 'App',
            renderCell: (app: App) => (
              <VStack gap={0}>
                <Link href={appRoute(app.id)}>{app.name}</Link>
                {app.vendor && (
                  <Text type="supporting" color="secondary">
                    {app.vendor}
                  </Text>
                )}
              </VStack>
            ),
          },
          {key: 'kind', header: 'Kind', renderCell: (app: App) => KIND_LABEL[app.kind]},
          {key: 'owner', header: 'Owner', renderCell: (app: App) => app.owner.name},
          {key: 'backupOwner', header: 'Backup owner', renderCell: (app: App) => app.backupOwner.name},
          {key: 'noticeDeadline', header: 'Notice deadline', renderCell: (app: App) => orDash(app.noticeDeadline)},
          {key: 'renewalDate', header: 'Renewal', renderCell: (app: App) => orDash(app.renewalDate)},
        ]}
      />
    </VStack>
  );
}
