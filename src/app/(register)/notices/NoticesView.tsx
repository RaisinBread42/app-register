'use client';

import {useEffect, useRef, useState} from 'react';
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
import {useToast} from '@astryxdesign/core/Toast';
import {VStack} from '@astryxdesign/core/VStack';
import {AUDIT_ACTION, FILTER_ALL, MATCH_STATUS, NOTICE_CATEGORIES, NOTICE_SEVERITIES, ROUTES, SOURCE_FRESH_HOURS, UI_QUERY} from '@/lib/constants';
import type {Notice} from '@/lib/ui/api-client';
import {
  MATCH_STATUS_LABEL,
  NOTICE_CATEGORY_LABEL,
  NOTICE_SEVERITY_LABEL,
  NOTICE_SEVERITY_VARIANT,
} from '@/lib/ui/copy';
import {
  INBOX_GROUP,
  INBOX_STATUS,
  hasNarrowingFilters,
  inboxGroups,
  inboxQuery,
  inboxRows,
  inboxViewFrom,
  type InboxRow,
  type InboxView,
} from '@/lib/ui/notice-inbox';
import {formatDate, formatDateTime} from '@/lib/ui/register-view';
import {changeMatchStatusAction} from '../actions';
import type {PersonOption} from '../applications/AppForm';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';
import {DONE_MESSAGE, NoticeDrawer} from './NoticeDrawer';
import {useConfirmWithUndo, type MatchKeys} from './use-confirm-with-undo';

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
  {value: INBOX_GROUP.app, label: 'Group by application'},
  {value: INBOX_GROUP.category, label: 'Group by kind'},
];

/** Keyboard shortcuts: only for high-value repeat actions, listed in the help dialog (spec §6). */
const SHORTCUTS = [
  {key: 'j', action: 'Next notice'},
  {key: 'k', action: 'Previous notice'},
  {key: 'Enter', action: 'Open the notice'},
  {key: 'r', action: 'Mark a new notice under the cursor as reviewing (with Undo)'},
  {key: '?', action: 'Show these shortcuts'},
] as const;

/** Shortcuts stay off while focus is in a field, a menu, a selector or a dialog, so they never fight its own keys. */
const OWN_KEYS = '[aria-haspopup],[role="listbox"],[role="option"],[role="menu"],[role="combobox"],[role="dialog"]';
const isOwnKeysTarget = (target: HTMLElement) =>
  target.isContentEditable ||
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
  target.closest(OWN_KEYS) !== null ||
  document.querySelector('[aria-haspopup][aria-expanded="true"]') !== null;

const column = (share: number) => proportional(share, {minWidth: 90});
type TableRow = {id: string; row: InboxRow};

type Props = {
  notices: Notice[];
  people: PersonOption[];
  keys: MatchKeys;
  /** Sources whose data may be out of date (the last check failed, or it is older than the freshness window). */
  staleSources: string[];
  /** False until any source has answered, so an empty inbox is not taken for an all clear. */
  hasAnySourceAnswered: boolean;
  today: string;
};

/** The inbox: one row per notice on one app (status belongs to the app), filtered by the URL. */
export function NoticesView({notices, people, keys, staleSources, hasAnySourceAnswered, today}: Props) {
  const searchParams = useSearchParams();
  const view = inboxViewFrom(Object.fromEntries(searchParams.entries()));
  const rows = inboxRows(notices, view);
  const allRows = inboxRows(notices, {...view, status: INBOX_STATUS.all, severity: FILTER_ALL, category: FILTER_ALL, app: FILTER_ALL});
  const open = allRows.find((row) => row.match.id === view.notice) ?? null;
  const [isHelpOpen, setHelpOpen] = useState(false);
  const apps = [...new Map(allRows.map(({match}) => [match.app.id, match.app.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const appOptions = [{value: FILTER_ALL, label: 'All applications'}, ...apps.map(([value, label]) => ({value, label}))];
  const confirm = useConfirmWithUndo(keys);
  const showToast = useToast();
  /** True while the open notice is an entry this page pushed, so closing it goes Back instead of adding another entry. */
  const pushed = useRef(false);
  const isMarking = useRef(false);

  /** Filters replace the URL; opening a notice adds an entry, so Back closes it and returns to the same list. */
  const go = (change: Partial<InboxView>, isNewEntry = false) => {
    const url = `${ROUTES.notices}${inboxQuery({...view, ...change})}`;
    if (isNewEntry) {
      pushed.current = true;
      window.history.pushState(null, '', url);
    } else {
      window.history.replaceState(null, '', url);
    }
  };
  const closeNotice = () => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      go({notice: ''});
    }
  };

  useEffect(() => {
    const onPop = () => {
      pushed.current = false;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** `r` acts only on a new notice (the one step that needs no reason or evidence), once at a time, and confirms with Undo. */
  const markReviewing = (row: InboxRow) => {
    if (row.match.status !== MATCH_STATUS.new) {
      showToast({body: `Only new notices can be marked reviewing with r. Open “${row.notice.title}” to change it.`});
      return;
    }
    if (isMarking.current) {
      return;
    }
    isMarking.current = true;
    void changeMatchStatusAction(keys.status[row.match.id], row.match.id, {status: MATCH_STATUS.reviewing}).then((result) => {
      isMarking.current = false;
      if (result.ok) {
        confirm(`${DONE_MESSAGE[MATCH_STATUS.reviewing]}: ${row.notice.title}`, row.match.id, {
          action: AUDIT_ACTION.noticeStatusChanged,
          toValue: MATCH_STATUS.reviewing,
        });
      } else {
        showToast({body: `Could not mark reviewing: ${result.error}`, type: 'error'});
      }
    });
  };

  useEffect(() => {
    if (open || isHelpOpen) {
      return;
    }
    const byMatch = new Map(rows.map((row) => [row.match.id, row]));
    const links = () => [...document.querySelectorAll<HTMLAnchorElement>(`a[href*="${UI_QUERY.notice}="][data-inbox-row]`)];
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isOwnKeysTarget(event.target as HTMLElement)) {
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
        const row = byMatch.get(new URL(list[at].href).searchParams.get(UI_QUERY.notice) ?? '');
        if (row) {
          markReviewing(row);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const nothingOpen = view.status === INBOX_STATUS.open && !hasNarrowingFilters(view) && rows.length === 0;
  const isStale = staleSources.length > 0 || !hasAnySourceAnswered;
  const groups = inboxGroups(rows, view.group);
  const columns = [
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
              // A modified or middle click opens the notice in a new tab, as any link does.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
                return;
              }
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
  ];
  const emptyState = nothingOpen ? (
    <EmptyState
      title={!hasAnySourceAnswered ? 'Nothing open yet, but nothing has been checked' : isStale ? 'Nothing open, but some data is out of date' : 'Nothing needs attention'}
      description={
        !hasAnySourceAnswered
          ? 'No source has answered yet, so there may be notices still to find.'
          : isStale
            ? 'Some sources did not answer or are not up to date, so this may change after the next check.'
            : `Every notice on your applications is handled or snoozed, and every source answered in the last ${SOURCE_FRESH_HOURS} hours.`
      }
      isCompact
    />
  ) : (
    <EmptyState title="No notices match your filters" description="Change or clear the filters to see more." isCompact />
  );

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
          title="Some data is out of date"
          description={`${staleSources.join(', ')} did not answer on the last check or last answered more than ${SOURCE_FRESH_HOURS} hours ago, so notices from them may be missing or out of date.`}
          collapsible={false}
        />
      )}
      {view.notice && !open && (
        <Banner
          status="info"
          title="That notice is not here"
          description="It may have been resolved by the source, or its application archived. The list below is current."
          collapsible={false}
          endContent={<Button label="Dismiss" variant="secondary" size="sm" onClick={() => go({notice: ''})} />}
        />
      )}
      <Card padding={0}>
        <VStack gap={0}>
          <HStack gap={2} padding={4} wrap="wrap" vAlign="center">
            <Selector label="Status" isLabelHidden options={STATUS_OPTIONS} value={view.status} onChange={(value) => go({status: value as InboxView['status']})} width={180} />
            <Selector label="Severity" isLabelHidden options={SEVERITY_OPTIONS} value={view.severity} onChange={(value) => go({severity: value as InboxView['severity']})} width={160} />
            <Selector label="Kind" isLabelHidden options={CATEGORY_OPTIONS} value={view.category} onChange={(value) => go({category: value as InboxView['category']})} width={180} />
            <Selector label="Application" isLabelHidden options={appOptions} value={view.app} onChange={(value) => go({app: value ?? FILTER_ALL})} width={200} />
            <Selector label="Order" isLabelHidden options={GROUP_OPTIONS} value={view.group} onChange={(value) => go({group: value as InboxView['group']})} width={200} />
          </HStack>
          {groups.map((group) => (
            <VStack key={group.key} gap={0}>
              {group.label && (
                <HStack paddingInline={4} paddingBlockStart={4} paddingBlockEnd={2}>
                  <Heading level={2}>{`${group.label} (${group.rows.length})`}</Heading>
                </HStack>
              )}
              <Table data={group.rows.map((row): TableRow => ({id: row.match.id, row}))} idKey="id" hasHover emptyState={emptyState} columns={columns} />
            </VStack>
          ))}
          {groups.length === 0 && <Table data={[] as TableRow[]} idKey="id" emptyState={emptyState} columns={columns} />}
        </VStack>
      </Card>
      <NoticeDrawer key={open?.match.id ?? ''} row={open} people={people} keys={keys} today={today} onClose={closeNotice} />
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
