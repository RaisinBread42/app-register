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
import {
  MOCK_APPS,
  MOCK_NOTICES,
  severityBadgeVariant,
  type MockNotice,
} from '../_data/seed';

const CATEGORY_OPTIONS = [
  {value: 'all', label: 'All categories'},
  {value: 'vulnerability', label: 'Vulnerability'},
  {value: 'dependency_update', label: 'Dependency update'},
  {value: 'licence_renewal', label: 'Licence renewal'},
  {value: 'pricing_change', label: 'Pricing change'},
  {value: 'hosting_outage', label: 'Hosting outage'},
  {value: 'platform_update', label: 'Platform update'},
  {value: 'retirement', label: 'Retirement notice'},
];

const SEVERITY_OPTIONS = [
  {value: 'all', label: 'All severities'},
  {value: 'critical', label: 'Critical'},
  {value: 'attention', label: 'Attention'},
  {value: 'info', label: 'Info'},
];

const APP_OPTIONS = [
  {value: 'all', label: 'All apps'},
  ...MOCK_APPS.map((a) => ({value: a.name, label: a.name})),
];

export default function MockNoticesPage() {
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [app, setApp] = useState('all');

  const rows = useMemo(() => {
    return MOCK_NOTICES.filter((n) => {
      if (category !== 'all' && n.category !== category) return false;
      if (severity !== 'all' && n.severity !== severity) return false;
      if (app !== 'all' && !n.apps.includes(app)) return false;
      return true;
    });
  }, [category, severity, app]);

  return (
    <MockShell active="notices">
      <VStack gap={5}>
        <VStack gap={1}>
          <Heading level={1}>Notices</Heading>
          <Text type="body" color="secondary" display="block">
            One feed across vulnerabilities, renewals, pricing, hosting and
            retirements. Demo data only.
          </Text>
        </VStack>

        <HStack gap={3} wrap="wrap" vAlign="end">
          <Selector
            label="Category"
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(v) => setCategory(v ?? 'all')}
            width={240}
          />
          <Selector
            label="Severity"
            options={SEVERITY_OPTIONS}
            value={severity}
            onChange={(v) => setSeverity(v ?? 'all')}
            width={180}
          />
          <Selector
            label="App"
            options={APP_OPTIONS}
            value={app}
            onChange={(v) => setApp(v ?? 'all')}
            width={220}
          />
        </HStack>

        <Table
          data={rows}
          idKey="id"
          hasHover
          density="balanced"
          columns={[
            {
              key: 'severity',
              header: 'Severity',
              renderCell: (n: MockNotice) => (
                <Badge
                  label={n.severity}
                  variant={severityBadgeVariant(n.severity)}
                />
              ),
            },
            {
              key: 'categoryLabel',
              header: 'Category',
              renderCell: (n: MockNotice) => (
                <Badge label={n.categoryLabel} variant="neutral" />
              ),
            },
            {
              key: 'title',
              header: 'Notice',
              renderCell: (n: MockNotice) => (
                <VStack gap={0}>
                  <Text type="body" weight="medium" display="block">
                    {n.title}
                  </Text>
                  <Text type="supporting" color="secondary" display="block">
                    {n.summary}
                  </Text>
                </VStack>
              ),
            },
            {
              key: 'apps',
              header: 'Apps',
              renderCell: (n: MockNotice) => n.apps.join(', '),
            },
            {key: 'date', header: 'Date'},
            {key: 'source', header: 'Source'},
            {
              key: 'actions',
              header: 'Action',
              renderCell: () => (
                <HStack gap={1}>
                  <Button label="Ack" variant="secondary" size="sm" />
                  <Button label="Snooze" variant="ghost" size="sm" />
                  <Button label="Resolve" variant="ghost" size="sm" />
                </HStack>
              ),
            },
          ]}
        />
      </VStack>
    </MockShell>
  );
}
