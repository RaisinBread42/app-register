'use client';

import {useMemo, useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Selector} from '@astryxdesign/core/Selector';
import {Table} from '@astryxdesign/core/Table';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {MockShell} from '../_components/MockShell';
import {
  MOCK_APPS,
  MOCK_ORG,
  statusBadgeVariant,
  type MockApp,
} from '../_data/seed';

const KIND_FILTERS = [
  {value: 'all', label: 'All kinds'},
  {value: 'saas', label: 'SaaS'},
  {value: 'in_house', label: 'In-house'},
  {value: 'citizen_built', label: 'Citizen-built'},
  {value: 'vendor_service', label: 'Vendor service'},
];

export default function MockListPage() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_APPS.filter((app) => {
      if (kind && kind !== 'all' && app.kind !== kind) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        app.name.toLowerCase().includes(q) ||
        app.owner.toLowerCase().includes(q) ||
        app.vendorOrRuntime.toLowerCase().includes(q)
      );
    });
  }, [query, kind]);

  return (
    <MockShell active="list">
      <VStack gap={5}>
        <HStack gap={4} vAlign="end" justify="between" wrap="wrap">
          <VStack gap={1}>
            <Heading level={1}>Apps</Heading>
            <Text type="body" color="secondary" display="block">
              {MOCK_ORG.name} · {MOCK_ORG.itTeam} · {MOCK_APPS.length} apps in
              the register
            </Text>
          </VStack>
          <Button label="Add app" variant="primary" href="/mockups/create" />
        </HStack>

        <HStack gap={3} vAlign="end" wrap="wrap">
          <TextInput
            label="Search"
            type="search"
            value={query}
            onChange={setQuery}
            placeholder="Name, owner, or vendor"
            startIcon="search"
            hasClear
            width={320}
          />
          <Selector
            label="Kind"
            options={KIND_FILTERS}
            value={kind}
            onChange={(v) => setKind(v ?? 'all')}
            width={200}
          />
        </HStack>

        <Table
          data={rows}
          idKey="id"
          hasHover
          density="balanced"
          dividers="rows"
          columns={[
            {
              key: 'name',
              header: 'App',
              renderCell: (app: MockApp) => (
                <Link href={`/mockups/edit?id=${app.id}`}>{app.name}</Link>
              ),
            },
            {
              key: 'kindLabel',
              header: 'Kind',
              renderCell: (app: MockApp) => (
                <Badge label={app.kindLabel} variant="neutral" />
              ),
            },
            {key: 'owner', header: 'Owner'},
            {key: 'vendorOrRuntime', header: 'Vendor / where it runs'},
            {key: 'noticeDeadline', header: 'Notice deadline'},
            {key: 'renewalDate', header: 'Renewal'},
            {key: 'costLabel', header: 'Cost'},
            {
              key: 'statusLabel',
              header: 'Status',
              renderCell: (app: MockApp) => (
                <Badge
                  label={app.statusLabel}
                  variant={statusBadgeVariant(app.status)}
                />
              ),
            },
          ]}
        />
      </VStack>
    </MockShell>
  );
}
