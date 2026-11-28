'use client';

import {useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Selector} from '@astryxdesign/core/Selector';
import {Table, proportional} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useToast} from '@astryxdesign/core/Toast';
import {VStack} from '@astryxdesign/core/VStack';
import {APP_CRITICALITIES, APP_LIST_SORTS, APP_STATE, CRITICALITY_FILTER_NOT_SET, DATE_KIND, FILTER_ALL, ROUTES, UI_QUERY_ON, type AppListSort, type AppState} from '@/lib/constants';
import type {App} from '@/lib/ui/api-client';
import {applyAppListView, catalogOwners, DEFAULT_APP_LIST_VIEW, filterByName, isFiltered, nextDate, type AppListView, type IssueSummary} from '@/lib/ui/catalog';
import {
  APP_LIST_SORT_LABEL,
  CRITICALITY_LABEL,
  CRITICALITY_NOT_SET,
  HEALTH_FILTER_OPTIONS,
  KIND_LABEL,
  KIND_OPTIONS,
  NOTICE_SEVERITY_LABEL,
  NOTICE_SEVERITY_VARIANT,
} from '@/lib/ui/copy';
import {appListQuery, appListViewFrom} from '@/lib/ui/list-filters';
import {rememberListQuery} from '@/lib/ui/list-memory';
import {DEFAULT_INBOX_VIEW, inboxQuery} from '@/lib/ui/notice-inbox';
import {formatDate, healthWord} from '@/lib/ui/register-view';
import {unarchiveAppAction} from '../actions';
import {AppCell} from '../_components/AppIdentity';
import {ScorePill} from '../_components/Health';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';
import {AddApplicationDialog} from './AddApplicationDialog';
import type {PersonOption} from './AppForm';

/** Narrow enough floors that every column fits a 1280 px screen beside the side nav. */
const column = (share: number) => proportional(share, {minWidth: 80});

const TYPE_FILTERS = [{value: FILTER_ALL, label: 'All types'}, ...KIND_OPTIONS];
const CRITICALITY_FILTERS = [
  {value: FILTER_ALL, label: 'All criticality'},
  ...APP_CRITICALITIES.map((value) => ({value, label: CRITICALITY_LABEL[value]})),
  {value: CRITICALITY_FILTER_NOT_SET, label: CRITICALITY_NOT_SET},
];
const NOTICE_FILTERS = [
  {value: FILTER_ALL, label: 'Any notices'},
  {value: UI_QUERY_ON, label: 'Open notices'},
];
const SORT_OPTIONS = APP_LIST_SORTS.map((sort) => ({value: sort, label: APP_LIST_SORT_LABEL[sort]}));

type Props = {
  apps: App[];
  /** Each app's most severe open notice, worked out on the server; null when the notices could not be read. */
  issues: Record<string, IssueSummary> | null;
  archivedApps: App[];
  /** One Idempotency-Key per archived app for Unarchive, rendered with the page. */
  unarchiveKeys: Record<string, string>;
  people: PersonOption[];
  addKey: string;
  initialView: AppListView;
  isAddOpen: boolean;
  today: string;
};

/**
 * The applications catalog (spec §4): one dense row per app with its highest active
 * issue, the apps that need attention first, and search, filters and sort in the URL.
 */
export function ApplicationsView({apps, issues: issueRecord, archivedApps, unarchiveKeys, people, addKey, initialView, isAddOpen, today}: Props) {
  const searchParams = useSearchParams();
  const [view, setView] = useState<AppListView>(initialView);
  const [isAdding, setIsAdding] = useState(isAddOpen);
  /** The query string this view last wrote, so its own URL updates are not read back as outside changes. */
  const written = useRef(appListQuery(initialView));
  const issues = useMemo(() => new Map(Object.entries(issueRecord ?? {})), [issueRecord]);
  // Typing stays quick on a long list: the table follows the search a moment later.
  const deferredView = useDeferredValue(view);
  const shown = useMemo(() => applyAppListView(apps, deferredView, issues, today), [apps, deferredView, issues, today]);
  const owners = useMemo(() => {
    const listed = catalogOwners(apps);
    // A shared link can name an owner who owns nothing now: say so instead of showing an unnamed filter.
    const isUnlisted = view.owner !== FILTER_ALL && !listed.some((owner) => owner.value === view.owner);
    return [{value: FILTER_ALL, label: 'All owners'}, ...listed, ...(isUnlisted ? [{value: view.owner, label: 'Owner with no applications'}] : [])];
  }, [apps, view.owner]);

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
      <PageHeader
        title="Applications"
        description="Every application your company buys or builds, the ones that need attention first."
        actions={apps.length > 0 || archivedApps.length > 0 ? addButton : undefined}
      />
      {issueRecord === null && apps.length > 0 && (
        <Banner
          status="warning"
          title="Notices could not be loaded"
          description="The highest active issue is missing for now, so the order may not show what needs attention first. Reload to try again."
          collapsible={false}
        />
      )}
      {apps.length === 0 && archivedApps.length === 0 ? (
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
              <Selector
                label="Status"
                isLabelHidden
                options={[
                  {value: APP_STATE.active, label: 'Active applications'},
                  {value: APP_STATE.archived, label: `Archived (${archivedApps.length})`},
                ]}
                value={view.state}
                onChange={(value) => update({state: (value as AppState | null) ?? APP_STATE.active})}
                width={190}
              />
              <TextInput
                label="Filter applications by name"
                isLabelHidden
                placeholder="Filter by name…"
                value={view.query}
                onChange={(value) => update({query: value ?? ''})}
                width={288}
              />
              {view.state === APP_STATE.active && (
                <>
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
                </>
              )}
            </HStack>
            {view.state === APP_STATE.archived ? (
              <ArchivedTable apps={filterByName(archivedApps, view.query)} total={archivedApps.length} keys={unarchiveKeys} />
            ) : (
              <>
              <Table
                aria-label="Applications"
                data={shown}
                idKey="id"
                hasHover
                emptyState={
                  apps.length === 0 ? (
                    <EmptyState
                      title="No active applications"
                      description={`All ${archivedApps.length} are archived. Unarchive one from the Archived list, or add a new one.`}
                      isCompact
                    />
                  ) : (
                    <EmptyState
                      title="No applications match these filters"
                      description="Change the search or clear the filters to see every application."
                      actions={<Button label="Clear filters" variant="secondary" onClick={() => update({...DEFAULT_APP_LIST_VIEW, sort: view.sort})} />}
                      isCompact
                    />
                  )
                }
                columns={[
                  {key: 'name', header: 'Application', width: proportional(2, {minWidth: 170}), renderCell: (app: App) => <AppCell app={app} />},
                  {key: 'kind', header: 'Type', width: proportional(1.2, {minWidth: 120}), renderCell: (app: App) => <Badge label={KIND_LABEL[app.kind]} variant="purple" />},
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
                    width: proportional(2, {minWidth: 170}),
                    renderCell: (app: App) => <IssueCell app={app} issue={issues.get(app.id)} />,
                  },
                  {key: 'next', header: 'Next date', width: column(1), renderCell: (app: App) => <NextDateCell app={app} today={today} />},
                ]}
              />
              <HStack paddingInline={4} paddingBlock={4} role="status">
                <Text type="supporting" color="secondary">
                  {`Showing ${shown.length} of ${apps.length} applications${isFiltered(deferredView) ? ' (filtered)' : ''}`}
                </Text>
              </HStack>
              </>
            )}
          </VStack>
        </Card>
      )}
      <AddApplicationDialog isOpen={isAdding} onClose={() => setIsAdding(false)} idempotencyKey={addKey} people={people} />
    </PageFrame>
  );
}

/** The score with a word ("Healthy", "Needs attention"), or "Not monitored" when nothing has been checked. */
function HealthCell({app}: {app: App}) {
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <ScorePill health={app.health} />
      <Text size="sm" color="secondary">
        {healthWord(app.health)}
      </Text>
    </HStack>
  );
}

/** The most severe open notice, linked to it in the inbox; otherwise what is known about issues (never an all-clear after a failed check). */
function IssueCell({app, issue}: {app: App; issue: IssueSummary | undefined}) {
  if (!issue) {
    return (
      <Text size="sm" color="secondary">
        {app.health.score === null ? healthWord(app.health) : app.health.hasFailedCheck ? 'None known: last check failed' : 'No active issues'}
      </Text>
    );
  }
  return (
    <HStack gap={2} vAlign="center">
      <HStack style={{flex: 'none'}}>
        <Badge label={NOTICE_SEVERITY_LABEL[issue.severity]} variant={NOTICE_SEVERITY_VARIANT[issue.severity]} />
      </HStack>
      <Link href={`${ROUTES.notices}${inboxQuery({...DEFAULT_INBOX_VIEW, notice: issue.matchId})}`} size="sm" maxLines={2}>
        {issue.title}
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
    <VStack gap={0.5}>
      <Text size="sm">{formatDate(next.date)}</Text>
      {next.isOverdue ? (
        <Badge label="Notice deadline passed" variant="red" />
      ) : (
        <Text type="supporting" color="secondary">
          {next.kind === DATE_KIND.notice ? 'Notice deadline' : 'Renewal'}
        </Text>
      )}
    </VStack>
  );
}

/** Archived applications, each with Unarchive; the toast says why when it cannot (for example, the name is in use). */
function ArchivedTable({apps, total, keys}: {apps: App[]; total: number; keys: Record<string, string>}) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const restore = async (app: App) => {
    setPendingId(app.id);
    const result = await unarchiveAppAction(keys[app.id], app.id);
    setPendingId(null);
    showToast(result.ok ? {body: `${app.name} is active again`} : {body: `Could not unarchive: ${result.error}`, type: 'error'});
    // The row (and its button) leaves the list: keep keyboard focus on the list, not the page.
    regionRef.current?.focus();
    router.refresh();
  };
  return (
    <VStack ref={regionRef} tabIndex={-1} gap={0}>
      <Table
        aria-label="Archived applications"
        data={apps}
        idKey="id"
        hasHover
        emptyState={
          <EmptyState
            title={total === 0 ? 'No archived applications' : 'Nothing archived matches the search'}
            description={total === 0 ? 'Archived applications show here, each with Unarchive.' : 'Change or clear the search.'}
            isCompact
          />
        }
        columns={[
          {
            key: 'name',
            header: 'Application',
            width: proportional(2, {minWidth: 150}),
            renderCell: (app: App) => (
              <VStack gap={1}>
                <AppCell app={app} />
                <Text type="supporting" color="secondary">{`Archived ${app.archivedAt ? formatDate(app.archivedAt) : ''}`}</Text>
              </VStack>
            ),
          },
          {
            key: 'action',
            header: 'Action',
            width: proportional(1, {minWidth: 100}),
            renderCell: (app: App) => <Button label="Unarchive" size="sm" variant="secondary" isLoading={pendingId === app.id} onClick={() => void restore(app)} />,
          },
        ]}
      />
    </VStack>
  );
}
