'use client';

import {useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {DateInput} from '@astryxdesign/core/DateInput';
import {Drawer} from '@astryxdesign/core/Drawer';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {VStack} from '@astryxdesign/core/VStack';
import {AUDIT_ACTION, MATCH_STATUS, NOTICE_ORIGIN, appRoute, type MatchStatus} from '@/lib/constants';
import {
  MATCH_CONFIDENCE_LABEL,
  MATCH_STATUS_LABEL,
  NOTICE_CATEGORY_LABEL,
  NOTICE_SEVERITY_LABEL,
  NOTICE_SEVERITY_VARIANT,
  NOT_SET,
} from '@/lib/ui/copy';
import {nextStep, tomorrow, type InboxRow} from '@/lib/ui/notice-inbox';
import {formatDate, formatDateTime} from '@/lib/ui/register-view';
import {assignMatchAction, changeMatchStatusAction} from '../actions';
import type {PersonOption} from '../applications/AppForm';
import {FormError} from '../_components/FormError';
import {isoDate} from '../_components/iso-date';
import {useAction} from '../_components/use-action';
import {useConfirmWithUndo, type MatchKeys} from './use-confirm-with-undo';

type Mode = 'snooze' | 'handle' | 'assign' | null;

const ORIGIN_LABEL = {[NOTICE_ORIGIN.external]: 'Outside source', [NOTICE_ORIGIN.person]: 'Entered by a person'} as const;
export const DONE_MESSAGE: Record<MatchStatus, string> = {
  [MATCH_STATUS.new]: 'Reopened',
  [MATCH_STATUS.reviewing]: 'Marked as reviewing',
  [MATCH_STATUS.snoozed]: 'Snoozed',
  [MATCH_STATUS.handled]: 'Marked handled',
};

type Props = {row: InboxRow | null; people: PersonOption[]; keys: MatchKeys; today: string; onClose: () => void};

/**
 * The notice drawer, in the order spec §6 sets: what happened → which app → why we
 * think so → what to do → source. Actions sit beside it; each confirms with a toast
 * that offers Undo. The page mounts one per notice (keyed by match), so nothing typed
 * for one notice carries over to the next.
 */
export function NoticeDrawer({row, people, keys, today, onClose}: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState('');
  const [until, setUntil] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const action = useAction();
  const confirm = useConfirmWithUndo(keys);

  if (!row) {
    return null;
  }
  const {notice, match} = row;
  const reset = () => {
    setMode(null);
    setNote('');
    setUntil('');
    action.clearError();
  };
  const setStatus = (status: MatchStatus, extra: {note?: string; snoozedUntil?: string} = {}) =>
    action.run(
      () => changeMatchStatusAction(keys.status[match.id], match.id, {status, ...extra}),
      () => {
        reset();
        confirm(`${DONE_MESSAGE[status]}: ${notice.title}`, match.id, {action: AUDIT_ACTION.noticeStatusChanged, toValue: status});
      },
    );
  const assign = () =>
    action.run(
      () => assignMatchAction(keys.assign[match.id], match.id, assignee),
      () => {
        reset();
        confirm(assignee ? 'Owner assigned' : 'Owner cleared', match.id, {action: AUDIT_ACTION.noticeAssigned, toValue: assignee});
      },
    );

  return (
    <Drawer isOpen onOpenChange={(isOpen) => !isOpen && (reset(), onClose())} label={notice.title} width={520} padding={6} purpose="form">
      <VStack gap={5}>
        <VStack gap={2}>
          <HStack gap={2} wrap="wrap" vAlign="center">
            <Badge label={NOTICE_SEVERITY_LABEL[notice.severity]} variant={NOTICE_SEVERITY_VARIANT[notice.severity]} />
            <Text type="supporting" color="secondary">
              {`${NOTICE_CATEGORY_LABEL[notice.category]} · ${MATCH_STATUS_LABEL[match.status]}`}
            </Text>
          </HStack>
          <Heading level={2}>{notice.title}</Heading>
        </VStack>

        <Section title="What happened">
          <Text>{notice.summary || notice.title}</Text>
          {notice.dueOn && <Text type="supporting" color="secondary">{`Date: ${formatDate(notice.dueOn)}`}</Text>}
        </Section>

        <Section title="Which application">
          <Link href={appRoute(match.app.id)}>{match.app.name}</Link>
          <Text type="supporting" color="secondary">
            {[match.component, match.version, match.region].filter(Boolean).join(' · ')}
          </Text>
        </Section>

        <Section title="Why we think so">
          <Text>{match.matchReason}</Text>
          <Text type="supporting" color="secondary">{MATCH_CONFIDENCE_LABEL[match.confidence]}</Text>
        </Section>

        <Section title="What to do">
          <Text>{nextStep(notice, match, today)}</Text>
        </Section>

        <Section title="Source">
          {notice.sourceUrl ? (
            <Link href={notice.sourceUrl} target="_blank">
              {`View source: ${notice.sourceName}`}
            </Link>
          ) : (
            <Text>{notice.sourceName}</Text>
          )}
          <Text type="supporting" color="secondary">
            {[
              ORIGIN_LABEL[notice.origin],
              notice.externalId,
              notice.publishedAt ? `Published ${formatDateTime(notice.publishedAt)}` : null,
              `First detected ${formatDateTime(notice.firstSeenAt)}`,
              `Last checked ${formatDateTime(notice.lastSeenAt)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Section>

        <Section title="Status">
          <Text>
            {`${MATCH_STATUS_LABEL[match.status]}${match.snoozedUntil ? ` until ${formatDate(match.snoozedUntil)}` : ''} · Owner: ${match.assignee?.name ?? NOT_SET}`}
          </Text>
          {match.statusNote && <Text type="supporting" color="secondary">{match.statusNote}</Text>}
        </Section>

        <FormError error={action.error} />

        {mode === 'snooze' && (
          <VStack gap={3}>
            <DateInput label="Snooze until" value={isoDate(until)} onChange={(value) => setUntil(value ?? '')} min={isoDate(tomorrow(today))} isRequired />
            <TextArea label="Reason" value={note} onChange={(value) => setNote(value ?? '')} isRequired />
            <HStack gap={2}>
              <Button label="Snooze" variant="primary" isLoading={action.isPending} onClick={() => setStatus(MATCH_STATUS.snoozed, {note, snoozedUntil: until})} />
              <Button label="Cancel" onClick={reset} />
            </HStack>
          </VStack>
        )}
        {mode === 'handle' && (
          <VStack gap={3}>
            <TextArea label="Evidence" description="What was done, and where to see it (a change, ticket or decision)." value={note} onChange={(value) => setNote(value ?? '')} isRequired />
            <HStack gap={2}>
              <Button label="Mark handled" variant="primary" isLoading={action.isPending} onClick={() => setStatus(MATCH_STATUS.handled, {note})} />
              <Button label="Cancel" onClick={reset} />
            </HStack>
          </VStack>
        )}
        {mode === 'assign' && (
          <VStack gap={3}>
            <Selector label="Owner" options={people} value={assignee} onChange={setAssignee} hasSearch hasClear placeholder="No owner" />
            <HStack gap={2}>
              <Button label="Assign owner" variant="primary" isLoading={action.isPending} onClick={assign} />
              <Button label="Cancel" onClick={reset} />
            </HStack>
          </VStack>
        )}
        {mode === null && (
          <HStack gap={2} wrap="wrap">
            {match.status === MATCH_STATUS.new && (
              <Button label="Mark reviewing" variant="primary" isLoading={action.isPending} onClick={() => setStatus(MATCH_STATUS.reviewing)} />
            )}
            {(match.status === MATCH_STATUS.new || match.status === MATCH_STATUS.reviewing) && (
              <>
                <Button label="Mark handled" variant={match.status === MATCH_STATUS.reviewing ? 'primary' : 'secondary'} onClick={() => setMode('handle')} />
                <Button label="Snooze" variant="secondary" onClick={() => setMode('snooze')} />
              </>
            )}
            {(match.status === MATCH_STATUS.snoozed || match.status === MATCH_STATUS.handled) && (
              <Button label="Reopen" variant="primary" isLoading={action.isPending} onClick={() => setStatus(MATCH_STATUS.new)} />
            )}
            <Button
              label="Assign owner"
              variant="secondary"
              onClick={() => {
                setAssignee(match.assignee?.id ?? null);
                setMode('assign');
              }}
            />
          </HStack>
        )}
      </VStack>
    </Drawer>
  );
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <VStack gap={1}>
      <Heading level={3}>{title}</Heading>
      {children}
    </VStack>
  );
}
