'use client';

import {useMemo, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Selector} from '@astryxdesign/core/Selector';
import {Table} from '@astryxdesign/core/Table';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {
  CategoryChecks,
  HealthScore,
  LicenceBadge,
} from '../_components/HealthBits';
import {MockShell} from '../_components/MockShell';
import {
  MOCK_ORG,
  SCORING_BLURB,
  appsByHealthAsc,
  type MockApp,
} from '../_data/seed';

const KIND_FILTERS = [
  {value: 'all', label: 'All kinds'},
  {value: 'saas', label: 'SaaS'},
  {value: 'in_house', label: 'In-house'},
  {value: 'citizen_built', label: 'Citizen-built'},
  {value: 'vendor_service', label: 'Vendor service'},
];

function cat(app: MockApp, key: MockApp['categories'][number]['key']) {
  return app.categories.find((c) => c.key === key)!;
}

export default function MockListPage() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return appsByHealthAsc().filter((app) => {
      if (kind !== 'all' && app.kind !== kind) return false;
      if (!q) return true;
      return (
        app.name.toLowerCase().includes(q) ||
        app.owner.toLowerCase().includes(q)
      );
    });
  }, [query, kind]);

  return (
    <MockShell active="apps">
      <VStack gap={5}>
        <HStack gap={4} vAlign="end" justify="between" wrap="wrap">
          <VStack gap={1}>
            <Heading level={1}>Apps</Heading>
            <Text type="body" color="secondary" display="block">
              {MOCK_ORG.name} · sorted by health (worst first) ·{' '}
              {rows.length} shown
            </Text>
            <Text type="supporting" color="secondary" display="block">
              {SCORING_BLURB}
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
            placeholder="Name or owner"
            startIcon="search"
            hasClear
            width={280}
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
          density="compact"
          dividers="rows"
          columns={[
            {
              key: 'name',
              header: 'App',
              renderCell: (app: MockApp) => (
                <VStack gap={0}>
                  <Link href={`/mockups/edit?id=${app.id}`}>{app.name}</Link>
                  <Text type="supporting" color="secondary">
                    {app.kindLabel} · {app.owner}
                  </Text>
                </VStack>
              ),
            },
            {
              key: 'healthScore',
              header: 'Health',
              renderCell: (app: MockApp) => (
                <HealthScore score={app.healthScore} size="sm" />
              ),
            },
            {
              key: 'licenceLabel',
              header: 'Licence',
              renderCell: (app: MockApp) => (
                <LicenceBadge
                  hasLicence={app.hasLicence}
                  label={app.licenceLabel}
                  status={app.licenceStatus}
                />
              ),
            },
            {
              key: 'deps',
              header: 'Deps',
              renderCell: (app: MockApp) => (
                <CategoryChecks cat={cat(app, 'dependencies')} />
              ),
            },
            {
              key: 'host',
              header: 'Hosting',
              renderCell: (app: MockApp) => (
                <CategoryChecks cat={cat(app, 'hosting')} />
              ),
            },
            {
              key: 'lic',
              header: 'Lic. chk',
              renderCell: (app: MockApp) => (
                <CategoryChecks cat={cat(app, 'licence')} />
              ),
            },
            {
              key: 'price',
              header: 'Pricing',
              renderCell: (app: MockApp) => (
                <CategoryChecks cat={cat(app, 'pricing')} />
              ),
            },
          ]}
        />
      </VStack>
    </MockShell>
  );
}
