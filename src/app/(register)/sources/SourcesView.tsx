'use client';

import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Grid} from '@astryxdesign/core/Grid';
import {HStack} from '@astryxdesign/core/HStack';
import {Selector} from '@astryxdesign/core/Selector';
import {Table} from '@astryxdesign/core/Table';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {FILTER_ALL} from '@/lib/constants';
import {COMING_SOON, MONITORING_COMING_SOON, NOT_SET} from '@/lib/ui/copy';
import {AppsIcon, CheckIcon, SourcesIcon, WarningIcon} from '@/lib/ui/icons';
import {FootNote, MetricCard} from '../_components/Cards';
import {PageFrame} from '../_components/PageFrame';
import {PageHeader} from '../_components/PageHeader';

const SOURCE_TYPES = [{value: FILTER_ALL, label: 'All source types'}];
const NO_SOURCES: {id: string}[] = [];

export function SourcesView() {
  return (
    <PageFrame crumbs={[{label: 'Sources'}]}>
      <PageHeader
        title="Monitoring sources"
        description="The external APIs and websites watched for advisories, updates, pricing changes and service status."
        actions={<Button label="+ Connect source" variant="primary" isDisabled tooltip={COMING_SOON} />}
      />
      <Grid columns={4} gap={4}>
        <MetricCard label="Total sources" value={NOT_SET} description="Tracked external sources" icon={SourcesIcon} />
        <MetricCard label="Healthy sources" value={NOT_SET} description="Checks running successfully" icon={CheckIcon} tone="green" />
        <MetricCard label="Needs attention" value={NOT_SET} description="Check failures or stale data" icon={WarningIcon} tone="amber" />
        <MetricCard label="Applications monitored" value={NOT_SET} description="Connected catalog items" icon={AppsIcon} />
      </Grid>
      <Card padding={0}>
        <VStack gap={0}>
          <HStack gap={2} paddingInline={4} paddingBlockStart={4} paddingBlockEnd={6} vAlign="center">
            <HStack gap={0} style={{flex: 1}}>
              <TextInput label="Search sources" isLabelHidden placeholder="Search sources…" value="" isDisabled width="100%" />
            </HStack>
            <Selector label="Source type" isLabelHidden options={SOURCE_TYPES} value={FILTER_ALL} isDisabled width={154} />
          </HStack>
          <Table
            data={NO_SOURCES}
            idKey="id"
            emptyState={
              <EmptyState
                title={MONITORING_COMING_SOON}
                description="Security advisories, package registries, cloud status pages and vendor pricing pages will be listed here."
              />
            }
            columns={[
              {key: 'source', header: 'Source'},
              {key: 'type', header: 'Type'},
              {key: 'apps', header: 'Connected applications'},
              {key: 'checked', header: 'Last checked'},
              {key: 'status', header: 'Status'},
            ]}
          />
        </VStack>
      </Card>
      <FootNote>{`${MONITORING_COMING_SOON}. No sources are connected yet.`}</FootNote>
    </PageFrame>
  );
}
