'use client';

import {useRouter} from 'next/navigation';
import {Selector} from '@astryxdesign/core/Selector';
import {VStack} from '@astryxdesign/core/VStack';
import {API_QUERY, FILTER_ALL, NOTICE_ALERT_STATUSES, ROUTES} from '@/lib/constants';
import type {NoticeAlert} from '@/lib/ui/api-client';
import {ALERT_STATUS_LABEL} from '@/lib/ui/copy';
import {AlertsTable} from '../_components/AlertsTable';
import {PageHeader} from '../_components/PageHeader';

const STATUS_OPTIONS = [
  {value: FILTER_ALL, label: 'All statuses'},
  ...NOTICE_ALERT_STATUSES.map((status) => ({value: status, label: ALERT_STATUS_LABEL[status]})),
];

type Props = {alerts: NoticeAlert[]; status?: string; keys: Record<string, string>};

export function NoticesView({alerts, status, keys}: Props) {
  const router = useRouter();

  function show(value: string | null) {
    const query = value && value !== FILTER_ALL ? `?${new URLSearchParams({[API_QUERY.status]: value})}` : '';
    router.push(`${ROUTES.notices}${query}`);
  }

  return (
    <VStack gap={5}>
      <PageHeader
        title="Notices"
        description="Notice-deadline alerts across every app, by due date. Archived apps stay here as history."
      />
      <Selector label="Status" options={STATUS_OPTIONS} value={status ?? FILTER_ALL} onChange={show} width={220} />
      <AlertsTable alerts={alerts} keys={keys} showApp />
    </VStack>
  );
}
