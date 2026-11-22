'use client';

import {useMemo, useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Selector} from '@astryxdesign/core/Selector';
import {Table} from '@astryxdesign/core/Table';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {MockShell} from '../_components/MockShell';
import {MOCK_SOURCES, type MockSource} from '../_data/seed';

const CATEGORY_OPTIONS = [
  {value: 'all', label: 'All categories'},
  {value: 'Dependencies', label: 'Dependencies'},
  {value: 'Hosting', label: 'Hosting'},
  {value: 'Pricing', label: 'Pricing'},
  {value: 'Licence', label: 'Licence'},
];

function statusVariant(
  status: MockSource['status'],
): 'success' | 'warning' | 'error' {
  if (status === 'connected') return 'success';
  if (status === 'stale') return 'warning';
  return 'error';
}

export default function MockSourcesPage() {
  const [category, setCategory] = useState('all');

  const rows = useMemo(() => {
    return MOCK_SOURCES.filter(
      (s) => category === 'all' || s.category === category,
    );
  }, [category]);

  return (
    <MockShell active="sources">
      <VStack gap={5}>
        <HStack gap={4} vAlign="end" justify="between" wrap="wrap">
          <VStack gap={1}>
            <Heading level={1}>Sources</Heading>
            <Text type="body" color="secondary" display="block">
              External APIs and pages we watch for CVEs, versions, outages,
              lifecycle and pricing. Demo URLs only.
            </Text>
          </VStack>
          <Button label="Add source" variant="primary" />
        </HStack>

        <Selector
          label="Category"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(v) => setCategory(v ?? 'all')}
          width={220}
        />

        <Table
          data={rows}
          idKey="id"
          hasHover
          density="balanced"
          columns={[
            {key: 'name', header: 'Source'},
            {
              key: 'category',
              header: 'Category',
              renderCell: (s: MockSource) => (
                <Badge label={s.category} variant="neutral" />
              ),
            },
            {
              key: 'status',
              header: 'Status',
              renderCell: (s: MockSource) => (
                <Badge label={s.status} variant={statusVariant(s.status)} />
              ),
            },
            {key: 'lastChecked', header: 'Last checked'},
            {
              key: 'appsUsing',
              header: 'Apps',
              renderCell: (s: MockSource) => String(s.appsUsing),
            },
            {
              key: 'url',
              header: 'Endpoint',
              renderCell: (s: MockSource) => (
                <Text type="supporting" color="secondary">
                  {s.url}
                </Text>
              ),
            },
          ]}
        />
      </VStack>
    </MockShell>
  );
}
