'use client';

import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Table, type TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {NOTICE_ALERT_STATUS, appRoute, type NoticeAlertStatus} from '@/lib/constants';
import type {NoticeAlert} from '@/lib/ui/api-client';
import {ALERT_STATUS_LABEL} from '@/lib/ui/copy';
import {acknowledgeAlertAction} from '../actions';
import {FormError} from './FormError';
import {useAction} from './use-action';

const STATUS_DOT: Record<NoticeAlertStatus, 'accent' | 'warning' | 'success'> = {
  [NOTICE_ALERT_STATUS.scheduled]: 'accent',
  [NOTICE_ALERT_STATUS.sent]: 'warning',
  [NOTICE_ALERT_STATUS.acknowledged]: 'success',
};

type Props = {alerts: NoticeAlert[]; keys: Record<string, string>; showApp?: boolean};

/** Notice alerts by due date, each with an Acknowledge button until someone has seen it. */
export function AlertsTable({alerts, keys, showApp = false}: Props) {
  const acknowledge = useAction();

  const appColumn: TableColumn<NoticeAlert>[] = showApp
    ? [{key: 'appName', header: 'App', renderCell: (a: NoticeAlert) => <Link href={appRoute(a.appId)}>{a.appName}</Link>}]
    : [];

  return (
    <VStack gap={3}>
      <FormError error={acknowledge.error} />
      <Table
        data={alerts}
        idKey="id"
        hasHover
        density="balanced"
        emptyState={<EmptyState title="No notice alerts" description="Alerts appear when an app has a notice deadline." isCompact />}
        columns={[
          ...appColumn,
          {key: 'dueOn', header: 'Alert due'},
          {key: 'offsetDays', header: 'Before deadline', renderCell: (a: NoticeAlert) => `${a.offsetDays} days`},
          {key: 'noticeDeadline', header: 'Notice deadline'},
          {
            key: 'status',
            header: 'Status',
            renderCell: (a: NoticeAlert) => (
              <HStack gap={2} vAlign="center">
                <StatusDot variant={STATUS_DOT[a.status]} label={ALERT_STATUS_LABEL[a.status]} />
                <Text>{ALERT_STATUS_LABEL[a.status]}</Text>
              </HStack>
            ),
          },
          {
            key: 'actions',
            header: '',
            renderCell: (a: NoticeAlert) =>
              a.status !== NOTICE_ALERT_STATUS.acknowledged && (
                <Button
                  label="Acknowledge"
                  variant="secondary"
                  size="sm"
                  isLoading={acknowledge.isPending}
                  onClick={() => acknowledge.run(() => acknowledgeAlertAction(keys[a.id], a.id))}
                />
              ),
          },
        ]}
      />
    </VStack>
  );
}
