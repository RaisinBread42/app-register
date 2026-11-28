'use client';

import {useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Selector} from '@astryxdesign/core/Selector';
import {Table, proportional} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {FILTER_ALL, MONITORING_SOURCE_STATUS, MONITORING_SOURCE_STATUSES, type MonitoringSourceStatus} from '@/lib/constants';
import type {MonitoringSource} from '@/lib/ui/api-client';
import {formatDateTime} from '@/lib/ui/register-view';

const TONE = {ok: 'green', warn: 'yellow', bad: 'red'} as const;
const NEVER_REFRESHED = 'Never answered';

const SOURCE_STATUS_BADGE: Record<MonitoringSourceStatus, {label: string; variant: (typeof TONE)[keyof typeof TONE]}> = {
  [MONITORING_SOURCE_STATUS.reachable]: {label: 'Reachable', variant: TONE.ok},
  [MONITORING_SOURCE_STATUS.configured]: {label: 'Configured', variant: TONE.warn},
  [MONITORING_SOURCE_STATUS.unavailable]: {label: 'Unavailable', variant: TONE.bad},
};

const STATUS_FILTERS = [
  {value: FILTER_ALL, label: 'All statuses'},
  ...MONITORING_SOURCE_STATUSES.map((status) => ({value: status, label: SOURCE_STATUS_BADGE[status].label})),
];

const column = (share: number) => proportional(share, {minWidth: 96});

/**
 * Settings › Monitoring sources: the Sources screen moved here (ADR 0003), showing the outside
 * sources the register really calls, when each last answered, its last error, and the apps
 * that rely on it ([31]). Only implemented sources are listed; there is no
 * "connect a source" control until a source can be connected (spec §10 item 32).
 */
export function MonitoringSourcesSection({sources}: {sources: MonitoringSource[]}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(FILTER_ALL);
  const needle = search.trim().toLowerCase();
  const shown = sources.filter(
    (source) =>
      (status === FILTER_ALL || source.status === status) &&
      (needle === '' || `${source.name} ${source.monitors}`.toLowerCase().includes(needle)),
  );
  const reachable = sources.filter((source) => source.status === MONITORING_SOURCE_STATUS.reachable).length;
  const unavailable = sources.filter((source) => source.status === MONITORING_SOURCE_STATUS.unavailable).length;

  return (
    <Card padding={0}>
      <VStack gap={0}>
        <VStack gap={3} padding={4}>
          <Text color="secondary">
            {`${sources.length} sources · ${reachable} reachable · ${unavailable} unavailable. These are the only outside sources the register calls.`}
          </Text>
          <HStack gap={2} wrap="wrap" vAlign="center">
            <TextInput label="Search sources" isLabelHidden placeholder="Search sources…" value={search} onChange={(value) => setSearch(value ?? '')} width={320} />
            <Selector label="Status" isLabelHidden options={STATUS_FILTERS} value={status} onChange={(value) => setStatus(value ?? FILTER_ALL)} width={170} />
          </HStack>
        </VStack>
        <Table
          data={shown}
          idKey="id"
          emptyState={<EmptyState title={sources.length === 0 ? 'No monitoring sources are configured' : 'No sources match your filters'} isCompact />}
          columns={[
            {
              key: 'name',
              header: 'Source',
              width: column(1.4),
              renderCell: (source: MonitoringSource) => (
                <Link href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.name}
                </Link>
              ),
            },
            {key: 'monitors', header: 'What it checks', width: column(2)},
            {
              key: 'status',
              header: 'Status',
              width: column(0.9),
              renderCell: (source: MonitoringSource) => (
                <Badge label={SOURCE_STATUS_BADGE[source.status].label} variant={SOURCE_STATUS_BADGE[source.status].variant} />
              ),
            },
            {
              key: 'lastRefreshedAt',
              header: 'Last answered',
              width: column(1.3),
              renderCell: (source: MonitoringSource) => (
                <VStack gap={0.5}>
                  <Text size="sm">{source.lastRefreshedAt ? formatDateTime(source.lastRefreshedAt) : NEVER_REFRESHED}</Text>
                  {source.lastError && (
                    <Text type="supporting" color="secondary">
                      {`Last attempt ${source.lastAttemptAt ? formatDateTime(source.lastAttemptAt) : ''} failed: ${source.lastError}`}
                    </Text>
                  )}
                </VStack>
              ),
            },
            {
              key: 'appNames',
              header: 'Used by',
              width: column(1.3),
              renderCell: (source: MonitoringSource) => (
                <Text size="sm" color={source.appNames.length ? undefined : 'secondary'}>
                  {source.appNames.length ? source.appNames.join(', ') : 'No application yet'}
                </Text>
              ),
            },
          ]}
        />
      </VStack>
    </Card>
  );
}
