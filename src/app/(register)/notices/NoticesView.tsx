'use client';

import {useEffect, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Dialog} from '@astryxdesign/core/Dialog';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Selector} from '@astryxdesign/core/Selector';
import {Table, proportional} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {FILTER_ALL, NOTICE_CATEGORIES, NOTICE_SEVERITIES, ROUTES, UI_QUERY} from '@/lib/constants';
import type {Notice} from '@/lib/ui/api-client';
import {
  MATCH_STATUS_LABEL,
  NOTICE_CATEGORY_LABEL,
  NOTICE_SEVERITY_LABEL,
  NOTICE_SEVERITY_VARIANT,
} from '@/lib/ui/copy';
import {INBOX_GROUP, INBOX_STATUS, inboxQuery, inboxRows, inboxViewFrom, type InboxRow, type InboxView} from '@/lib/ui/notice-inbox';
import {formatDate, formatDateTime} from '@/lib/ui/register-view';
import {changeMatchStatusAction} from '../actions';
import type {PersonOption} from '../applications/AppForm';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';
import {NoticeDrawer, type MatchKeys} from './NoticeDrawer';

const STATUS_OPTIONS = [
  {value: INBOX_STATUS.open, label: 'Needs attention'},
  {value: INBOX_STATUS.snoozed, label: 'Snoozed'},
  {value: INBOX_STATUS.handled, label: 'Handled'},
  {value: INBOX_STATUS.all, label: 'All statuses'},
];
const SEVERITY_OPTIONS = [{value: FILTER_ALL, label: 'All severities'}, ...NOTICE_SEVERITIES.map((value) => ({value, label: NOTICE_SEVERITY_LABEL[value]}))];
const CATEGORY_OPTIONS = [{value: FILTER_ALL, label: 'All kinds'}, ...NOTICE_CATEGORIES.map((value) => ({value, label: NOTICE_CATEGORY_LABEL[value]}))];
const GROUP_OPTIONS = [
  {value: INBOX_GROUP.severity, label: 'Most severe first'},
  {value: INBOX_GROUP.app, label: 'By application'},
];

/** Keyboard shortcuts: only for high-value repeat actions, listed in the help dialog (spec §6). */
const SHORTCUTS = [
  {key: 'j', action: 'Next notice'},
  {key: 'k', action: 'Previous notice'},
  {key: 'Enter', action: 'Open the notice'},
  {key: 'r', action: 'Mark the notice under the cursor as reviewing'},
  {key: '?', action: 'Show these shortcuts'},
] as const;

const column = (share: number) => proportional(share, {minWidth: 90});
type TableRow = {id: string; row: InboxRow};

type Props = {
  notices: Notice[];
  people: PersonOption[];
  keys: MatchKeys;
  staleSources: string[];
  today: string;
};

/** The inbox: one row per notice on one app (status belongs to the app), filtered by the URL. */
export function NoticesView({notices, people, keys, staleSources, today}: Props) {
  const searchParams = useSearchParams();
  const view = inboxViewFrom(Object.fromEntries(searchParams.entries()));
  const rows = inboxRows(notices, view);
  const allRows = inboxRows(notices, {...view, status: INBOX_STATUS.all, severity: FILTER_ALL, category: FILTER_ALL, app: FILTER_ALL});
  const open = allRows.find((row) => row.match.id === view.notice) ?? null;
  const [isHelpOpen, setHelpOpen] = useState(false);
  const apps = [...new Map(allRows.map(({match}) => [match.app.id, match.app.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const appOptions = [{value: FILTER_ALL, label: 'All applications'}, ...apps.map(([value, label]) => ({value, label}))];

  /** Filters replace the URL; opening a notice adds an entry, so Back closes it and returns to the same list. */
  const go = (change: Partial<InboxView>, isNewEntry = false) => {
    const url = `${ROUTES.notices}${inboxQuery({...view, ...change})}`;
    if (isNewEntry) {
      window.history.pushState(null, '', url);
    } else {
      window.history.replaceState(null, '', url);
    }
  };

  useEffect(() => {
    const links = () => [...document.querySelectorAll<HTMLAnchorElement>(`a[href*="${UI_QUERY.notice}="][data-inbox-row]`)];
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }
      if (event.key === '?') {
        setHelpOpen(true);
        return;
      }
      const list = links();
      const at = list.indexOf(document.activeElement as HTMLAnchorElement);
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const next = event.key === 'j' ? Math.min(at + 1, list.length - 1) : Math.max(at - 1, 0);
        list[next]?.focus();
      } else if (event.key === 'r' && at >= 0) {
        const matchId = new URL(list[at].href).searchParams.get(UI_QUERY.notice);
        if (matchId && keys.status[matchId]) {
          void changeMatchStatusAction(keys.status[matchId], matchId, {status: 'reviewing'});
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys]);

  const nothingOpen = view.status === INBOX_STATUS.open && rows.length === 0;
  const data: TableRow[] = rows.map((row) => ({id: row.match.id, row}));

  return (
    <PageFrame crumbs={[{label: 'Notices'}]}>
      <PageHeader
        title="Notices"
        description="What changed or is due for your applications, most severe first, with where it came from and what to do."
        actions={<Button label="Keyboard shortcuts" variant="secondary" onClick={() => setHelpOpen(true)} />}
      />
      {staleSources.length > 0 && (
        <Banner
          status="warning"
          title="Some sources could not be checked"
          description={`${staleSources.join(', ')} did not answer on the last check, so notices from them may be out of date.`}
          collapsible={false}
        />
      )}
      <Card padding={0}>
        <VStack gap={0}>
          <HStack gap={2} padding={4} wrap="wrap" vAlign="center">
            <Selector label="Status" isLabelHidden options={STATUS_OPTIONS} value={view.status} onChange={(value) => go({status: value as InboxView['status']})} width={180} />
            <Selector label="Severity" isLabelHidden options={SEVERITY_OPTIONS} value={view.severity} onChange={(value) => go({severity: value as InboxView['severity']})} width={160} />
            <Selector label="Kind" isLabelHidden options={CATEGORY_OPTIONS} value={view.category} onChange={(value) => go({category: value as InboxView['category']})} width={180} />
            <Selector label="Application" isLabelHidden options={appOptions} value={view.app} onChange={(value) => go({app: value ?? FILTER_ALL})} width={200} />
            <Selector label="Order" isLabelHidden options={GROUP_OPTIONS} value={view.group} onChange={(value) => go({group: value as InboxView['group']})} width={180} />
          </HStack>
          <Table
            data={data}
            idKey="id"
            hasHover
            emptyState={
              <EmptyState
                title={nothingOpen ? (staleSources.length ? 'Nothing open, but some data is out of date' : 'Nothing needs attention') : 'No notices match your filters'}
                description={
                  nothingOpen
                    ? staleSources.length
                      ? 'Some sources did not answer, so this may change after the next check.'
                      : 'Every notice on your applications is handled or snoozed, and the sources were checked.'
                    : 'Change the filters to see more.'
                }
                isCompact
              />
            }
            columns={[
              {
                key: 'notice',
                header: 'Notice',
                width: proportional(3, {minWidth: 220}),
                renderCell: ({row}: TableRow) => (
                  <VStack gap={0.5}>
                    <Link
                      href={`${ROUTES.notices}${inboxQuery({...view, notice: row.match.id})}`}
                      data-inbox-row=""
                      onClick={(event) => {
                        event.preventDefault();
                        go({notice: row.match.id}, true);
                      }}>
                      {row.notice.title}
                    </Link>
                    <Text type="supporting" color="secondary">
                      {NOTICE_CATEGORY_LABEL[row.notice.category]}
                    </Text>
                  </VStack>
                ),
              },
              {
                key: 'severity',
                header: 'Severity',
                width: column(1),
                renderCell: ({row}: TableRow) => <Badge label={NOTICE_SEVERITY_LABEL[row.notice.severity]} variant={NOTICE_SEVERITY_VARIANT[row.notice.severity]} />,
              },
              {key: 'status', header: 'Status', width: column(1), renderCell: ({row}: TableRow) => MATCH_STATUS_LABEL[row.match.status]},
              {key: 'app', header: 'Application', width: column(1.4), renderCell: ({row}: TableRow) => row.match.app.name},
              {
                key: 'due',
                header: 'Deadline',
                width: column(1),
                renderCell: ({row}: TableRow) => (row.notice.dueOn ? formatDate(row.notice.dueOn) : 'No date'),
              },
              {key: 'checked', header: 'Last checked', width: column(1.2), renderCell: ({row}: TableRow) => formatDateTime(row.notice.lastSeenAt)},
            ]}
          />
        </VStack>
      </Card>
      <NoticeDrawer row={open} people={people} keys={keys} today={today} onClose={() => go({notice: ''})} />
      <Dialog isOpen={isHelpOpen} onOpenChange={setHelpOpen} purpose="info" width={420} padding={6}>
        <VStack gap={3}>
          <Heading level={2}>Keyboard shortcuts</Heading>
          {SHORTCUTS.map((shortcut) => (
            <HStack key={shortcut.key} gap={3} vAlign="center">
              <Badge label={shortcut.key} variant="neutral" />
              <Text>{shortcut.action}</Text>
            </HStack>
          ))}
          <Text type="supporting" color="secondary">
            Shortcuts are off while you type in a field.
          </Text>
          <HStack hAlign="end">
            <Button label="Close" onClick={() => setHelpOpen(false)} />
          </HStack>
        </VStack>
      </Dialog>
    </PageFrame>
  );
}
