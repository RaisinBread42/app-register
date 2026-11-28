'use client';

import {useEffect, useRef, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Selector} from '@astryxdesign/core/Selector';
import {Table, proportional} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {APP_CRITICALITIES, APP_LIST_SORTS, DATE_KIND, FILTER_ALL, ROUTES, UI_QUERY_ON, type AppListSort} from '@/lib/constants';
import type {App, Notice} from '@/lib/ui/api-client';
import {applyAppListView, catalogOwners, DEFAULT_APP_LIST_VIEW, isFiltered, nextDate, topIssues, type AppListView} from '@/lib/ui/catalog';
import {
  APP_LIST_SORT_LABEL,
  CRITICALITY_LABEL,
  CRITICALITY_NOT_SET,
  HEALTH_FILTER_OPTIONS,
  KIND_LABEL,
  KIND_OPTIONS,
  NOT_MONITORED,
  NOTICE_SEVERITY_LABEL,
  NOTICE_SEVERITY_VARIANT,
  healthVerdict,
} from '@/lib/ui/copy';
import {appListQuery, appListViewFrom} from '@/lib/ui/list-filters';
import {rememberListQuery} from '@/lib/ui/list-memory';
import {DEFAULT_INBOX_VIEW, inboxQuery, type InboxRow} from '@/lib/ui/notice-inbox';
import {formatDate} from '@/lib/ui/register-view';
import {AppCell} from '../_components/AppIdentity';
import {ScorePill} from '../_components/Health';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';
import {AddApplicationDialog} from './AddApplicationDialog';
import type {PersonOption} from './AppForm';

const column = (share: number) => proportional(share, {minWidth: 96});

const TYPE_FILTERS = [{value: FILTER_ALL, label: 'All types'}, ...KIND_OPTIONS];
const CRITICALITY_FILTERS = [{value: FILTER_ALL, label: 'All criticality'}, ...APP_CRITICALITIES.map((value) => ({value, label: CRITICALITY_LABEL[value]}))];
const NOTICE_FILTERS = [
  {value: FILTER_ALL, label: 'Any notices'},
  {value: UI_QUERY_ON, label: 'Open notices'},
];
const SORT_OPTIONS = APP_LIST_SORTS.map((sort) => ({value: sort, label: APP_LIST_SORT_LABEL[sort]}));

type Props = {apps: App[]; notices: Notice[]; people: PersonOption[]; addKey: string; initialView: AppListView; isAddOpen: boolean; today: string};

/**
 * The applications catalog (spec §4): one dense row per app with its highest active
 * issue, the apps that need attention first, and search, filters and sort in the URL.
 */
export function ApplicationsView({apps, notices, people, addKey, initialView, isAddOpen, today}: Props) {
  const searchParams = useSearchParams();
  const [view, setView] = useState<AppListView>(initialView);
  const [isAdding, setIsAdding] = useState(isAddOpen);
  /** The query string this view last wrote, so its own URL updates are not read back as outside changes. */
  const written = useRef(appListQuery(initialView));
  const issues = topIssues(notices);
  const shown = applyAppListView(apps, view, issues, today);
  const owners = [{value: FILTER_ALL, label: 'All owners'}, ...catalogOwners(apps)];

  // The URL is the source of truth: when it changes from outside (topbar search, the side nav,
  // Back and Forward), the list follows it.
  const urlQuery = searchParams.toString();
  useEffect(() => {
    const fromUrl = appListViewFrom(Object.fromEntries(new URLSearchParams(urlQuery)));
    const asQuery = appListQuery(fromUrl);
    rememberListQuery(asQuery);
    if (asQuery !== written.current) {
      written.current = asQuery;
      setView(fromUrl);
    }
  }, [urlQuery]);

  /** Every change goes into the URL (no server round trip), so Back from an app and shared links restore the same list. */
  const update = (change: Partial<AppListView>) => {
    const next = {...view, ...change};
    setView(next);
    written.current = appListQuery(next);
    rememberListQuery(written.current);
    window.history.replaceState(null, '', `${ROUTES.applications}${written.current}`);
  };
  const addButton = <Button label="+ Add application" variant="primary" onClick={() => setIsAdding(true)} />;

  return (
    <PageFrame crumbs={[{label: 'Applications'}]}>
      <PageHeader title="Applications" description="Every application your company buys or builds, the ones that need attention first." actions={addButton} />
      {apps.length === 0 ? (
        <Card>
          <EmptyState
            title="No applications yet"
            description="Nothing is being watched until you add an application, so an empty list does not mean all is well. Add the first one to see its health, notices and dates."
            actions={addButton}
          />
        </Card>
      ) : (
        <Card padding={0}>
          <VStack gap={0}>
            <HStack gap={2} padding={4} vAlign="center" wrap="wrap">
              <TextInput
                label="Search applications"
                isLabelHidden
                placeholder="Search applications…"
                value={view.query}
                onChange={(value) => update({query: value ?? ''})}
                width={288}
              />
              <Selector label="Type" isLabelHidden options={TYPE_FILTERS} value={view.kind} onChange={(value) => update({kind: value ?? FILTER_ALL})} width={140} />
              <Selector
                label="Criticality"
                isLabelHidden
                options={CRITICALITY_FILTERS}
                value={view.criticality}
                onChange={(value) => update({criticality: value ?? FILTER_ALL})}
                width={140}
              />
              <Selector label="Owner" isLabelHidden options={owners} value={view.owner} onChange={(value) => update({owner: value ?? FILTER_ALL})} width={140} hasSearch />
              <Selector label="Health" isLabelHidden options={HEALTH_FILTER_OPTIONS} value={view.health} onChange={(value) => update({health: value ?? FILTER_ALL})} width={140} />
              <Selector
                label="Notices"
                isLabelHidden
                options={NOTICE_FILTERS}
                value={view.openNotices ? UI_QUERY_ON : FILTER_ALL}
                onChange={(value) => update({openNotices: value === UI_QUERY_ON})}
                width={140}
              />
              <Selector
                label="Sort by"
                isLabelHidden
                options={SORT_OPTIONS}
                value={view.sort}
                onChange={(value) => update({sort: (value as AppListSort | null) ?? DEFAULT_APP_LIST_VIEW.sort})}
                width={190}
              />
            </HStack>
            <Table
              data={shown}
              idKey="id"
              hasHover
              emptyState={
                <EmptyState
                  title="No applications match these filters"
                  description="Change the search or clear the filters to see every application."
                  actions={<Button label="Clear filters" variant="secondary" onClick={() => update({...DEFAULT_APP_LIST_VIEW, sort: view.sort})} />}
                  isCompact
                />
              }
              columns={[
                {key: 'name', header: 'Application', width: proportional(2, {minWidth: 200}), renderCell: (app: App) => <AppCell app={app} />},
                {key: 'kind', header: 'Type', width: proportional(1.2, {minWidth: 136}), renderCell: (app: App) => <Badge label={KIND_LABEL[app.kind]} variant="purple" />},
                {key: 'owner', header: 'Owner', width: column(1.1), renderCell: (app: App) => app.owner.name},
                {
                  key: 'criticality',
                  header: 'Criticality',
                  width: column(0.9),
                  renderCell: (app: App) => (app.criticality ? CRITICALITY_LABEL[app.criticality] : CRITICALITY_NOT_SET),
                },
                {key: 'health', header: 'Health', width: column(1.2), renderCell: (app: App) => <HealthCell app={app} />},
                {
                  key: 'issue',
                  header: 'Highest active issue',
                  width: proportional(2, {minWidth: 200}),
                  renderCell: (app: App) => <IssueCell app={app} issue={issues.get(app.id)} />,
                },
                {key: 'next', header: 'Next date', width: column(1), renderCell: (app: App) => <NextDateCell app={app} today={today} />},
              ]}
            />
            <HStack paddingInline={4} paddingBlock={4}>
              <Text type="supporting" color="secondary">
                {`Showing ${shown.length} of ${apps.length} applications${isFiltered(view) ? ' (filtered)' : ''}`}
              </Text>
            </HStack>
          </VStack>
        </Card>
      )}
      <AddApplicationDialog isOpen={isAdding} onClose={() => setIsAdding(false)} idempotencyKey={addKey} people={people} />
    </PageFrame>
  );
}

/** The score with a word ("Healthy", "Needs attention"), or "Not monitored" when nothing has been checked. */
function HealthCell({app}: {app: App}) {
  const {score} = app.health;
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <ScorePill health={app.health} />
      <Text size="sm" color="secondary">
        {score === null ? NOT_MONITORED : healthVerdict(score)}
      </Text>
    </HStack>
  );
}

/** The most severe open notice, linked to it in the inbox; otherwise what is known about issues. */
function IssueCell({app, issue}: {app: App; issue: InboxRow | undefined}) {
  if (!issue) {
    return (
      <Text size="sm" color="secondary">
        {app.health.score === null ? NOT_MONITORED : 'No active issues'}
      </Text>
    );
  }
  return (
    <HStack gap={2} vAlign="center">
      <HStack style={{flex: 'none'}}>
        <Badge label={NOTICE_SEVERITY_LABEL[issue.notice.severity]} variant={NOTICE_SEVERITY_VARIANT[issue.notice.severity]} />
      </HStack>
      <Link href={`${ROUTES.notices}${inboxQuery({...DEFAULT_INBOX_VIEW, notice: issue.match.id})}`} size="sm" maxLines={2}>
        {issue.notice.title}
      </Link>
    </HStack>
  );
}

function NextDateCell({app, today}: {app: App; today: string}) {
  const next = nextDate(app, today);
  if (!next) {
    return (
      <Text size="sm" color="secondary">
        None ahead
      </Text>
    );
  }
  return (
    <VStack gap={0}>
      <Text size="sm">{formatDate(next.date)}</Text>
      <Text type="supporting" color="secondary">
        {next.kind === DATE_KIND.notice ? 'Notice deadline' : 'Renewal'}
      </Text>
    </VStack>
  );
}
