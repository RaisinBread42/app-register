'use client';

import {Badge} from '@astryxdesign/core/Badge';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {MONITORING_SOURCE_STATUS, type MonitoringSourceStatus} from '@/lib/constants';
import type {MonitoringSource} from '@/lib/ui/api-client';
import {formatDateTime} from '@/lib/ui/register-view';
import {KeyValueRows, PanelCard} from '../_components/Cards';

const TONE = {ok: 'green', warn: 'yellow', bad: 'red'} as const;
const NEVER_REFRESHED = 'Never refreshed';

function titleCase(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

const SOURCE_STATUS_BADGE: Record<MonitoringSourceStatus, {label: string; variant: (typeof TONE)[keyof typeof TONE]}> = {
  [MONITORING_SOURCE_STATUS.reachable]: {label: titleCase(MONITORING_SOURCE_STATUS.reachable), variant: TONE.ok},
  [MONITORING_SOURCE_STATUS.configured]: {label: titleCase(MONITORING_SOURCE_STATUS.configured), variant: TONE.warn},
  [MONITORING_SOURCE_STATUS.unavailable]: {label: titleCase(MONITORING_SOURCE_STATUS.unavailable), variant: TONE.bad},
};

/** Settings › Monitoring sources: the outside sources the register really calls, with status and last refresh. */
export function MonitoringSourcesSection({sources}: {sources: MonitoringSource[]}) {
  return (
    <PanelCard
      title="Monitoring data sources"
      subtitle="Outside sources this register actually calls for dependency and hosting health"
    >
      {sources.length === 0 ? (
        <EmptyState title="No sources" description="No monitoring sources are configured." isCompact />
      ) : (
        <KeyValueRows
          rows={sources.map((source) => {
            const badge = SOURCE_STATUS_BADGE[source.status];
            return {
              label: source.name,
              value: (
                <HStack gap={3} vAlign="center" wrap="wrap" justify="end">
                  <Text size="sm" color="secondary">
                    {source.monitors}
                  </Text>
                  <Badge label={badge.label} variant={badge.variant} />
                  <Text size="sm" weight="bold">
                    {source.lastRefreshedAt ? formatDateTime(source.lastRefreshedAt) : NEVER_REFRESHED}
                  </Text>
                </HStack>
              ),
            };
          })}
        />
      )}
    </PanelCard>
  );
}
