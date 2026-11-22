'use client';

import {Suspense, useMemo, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Tab} from '@astryxdesign/core/TabList';
import {TabList} from '@astryxdesign/core/TabList';
import {Table} from '@astryxdesign/core/Table';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {HealthScore} from '../_components/HealthBits';
import {MockShell} from '../_components/MockShell';
import {
  MOCK_APPS,
  MOCK_NOTICES,
  severityBadgeVariant,
  type CategoryHealth,
  type MockNotice,
} from '../_data/seed';

type TabKey =
  | 'overview'
  | 'dependencies'
  | 'hosting'
  | 'notices'
  | 'sources';

function DetailInner() {
  const params = useSearchParams();
  const id = params.get('id') ?? 'a5';
  const app = useMemo(
    () => MOCK_APPS.find((a) => a.id === id) ?? MOCK_APPS[0],
    [id],
  );
  const [tab, setTab] = useState<TabKey>('overview');

  const appNotices = MOCK_NOTICES.filter((n) => n.apps.includes(app.name));
  const deducting = app.categories.filter((c) => c.deduction > 0);

  return (
    <MockShell active="detail">
      <VStack gap={5}>
        <HStack gap={4} vAlign="start" justify="between" wrap="wrap">
          <VStack gap={1}>
            <Text type="supporting" color="secondary">
              <Button label="← Apps" variant="ghost" size="sm" href="/mockups/list" />
            </Text>
            <Heading level={1}>{app.name}</Heading>
            <Text type="body" color="secondary" display="block">
              {app.kindLabel} · Owner {app.owner} · Backup {app.backupOwner}
            </Text>
          </VStack>
          <HealthScore score={app.healthScore} />
        </HStack>

        <VStack gap={2}>
          <Heading level={2}>Score breakdown</Heading>
          <Text type="supporting" color="secondary" display="block">
            Starts at 100. Points deducted by category below.
          </Text>
          {deducting.length === 0 ? (
            <Badge label="All clear — no deductions" variant="success" />
          ) : (
            <VStack gap={2}>
              {deducting.map((c: CategoryHealth) => (
                <HStack key={c.key} gap={3} vAlign="start" wrap="wrap">
                  <Badge
                    label={`${c.label} −${c.deduction}`}
                    variant={severityBadgeVariant(c.severity)}
                  />
                  <Text type="body" display="block">
                    {c.reasons.join(' · ')}
                  </Text>
                </HStack>
              ))}
            </VStack>
          )}
        </VStack>

        <TabList value={tab} onChange={(v) => setTab(v as TabKey)} role="tablist">
          <Tab value="overview" label="Overview" />
          <Tab value="dependencies" label="Dependencies" />
          <Tab value="hosting" label="Hosting" />
          <Tab value="notices" label={`Notices (${appNotices.length})`} />
          <Tab value="sources" label="Sources" />
        </TabList>

        {tab === 'overview' && (
          <VStack gap={3}>
            <HStack gap={6} wrap="wrap">
              <VStack gap={1}>
                <Text type="label" color="secondary">
                  Owner
                </Text>
                <Text type="body">{app.owner}</Text>
              </VStack>
              <VStack gap={1}>
                <Text type="label" color="secondary">
                  Kind
                </Text>
                <Text type="body">{app.kindLabel}</Text>
              </VStack>
              <VStack gap={1}>
                <Text type="label" color="secondary">
                  Licence
                </Text>
                <Text type="body">
                  {app.hasLicence ? app.licenceLabel : '— (no licence)'}
                </Text>
              </VStack>
              <VStack gap={1}>
                <Text type="label" color="secondary">
                  Notice deadline
                </Text>
                <Text type="body">
                  {app.hasLicence ? app.noticeDeadline : '—'}
                </Text>
              </VStack>
              <VStack gap={1}>
                <Text type="label" color="secondary">
                  Renewal
                </Text>
                <Text type="body">
                  {app.hasLicence ? app.renewalDate : '—'}
                </Text>
              </VStack>
              <VStack gap={1}>
                <Text type="label" color="secondary">
                  Cost
                </Text>
                <Text type="body">{app.costLabel}</Text>
              </VStack>
            </HStack>
          </VStack>
        )}

        {tab === 'dependencies' && (
          <Table
            data={app.dependencies}
            idKey="name"
            hasHover
            density="balanced"
            columns={[
              {key: 'name', header: 'Package'},
              {key: 'current', header: 'Current'},
              {key: 'latest', header: 'Latest'},
              {
                key: 'vulns',
                header: 'Vulnerabilities',
                renderCell: (d: (typeof app.dependencies)[0]) =>
                  d.vulns.length === 0 ? (
                    <Badge label="None" variant="success" />
                  ) : (
                    <HStack gap={1} wrap="wrap">
                      {d.vulns.map((v) => (
                        <Badge key={v} label={v} variant="error" />
                      ))}
                    </HStack>
                  ),
              },
              {key: 'action', header: 'Action'},
            ]}
          />
        )}

        {tab === 'hosting' && (
          <Table
            data={app.hosting}
            idKey="service"
            hasHover
            density="balanced"
            columns={[
              {key: 'provider', header: 'Provider'},
              {key: 'service', header: 'Service'},
              {key: 'region', header: 'Region'},
              {key: 'version', header: 'Version'},
              {key: 'support', header: 'Support / retirement'},
            ]}
          />
        )}

        {tab === 'notices' && (
          <Table
            data={appNotices}
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
              {key: 'categoryLabel', header: 'Category'},
              {key: 'title', header: 'Notice'},
              {key: 'date', header: 'Date'},
              {key: 'source', header: 'Source'},
            ]}
          />
        )}

        {tab === 'sources' && (
          <VStack gap={2}>
            <Text type="body" color="secondary" display="block">
              Sources that feed checks for this app (demo). Full catalogue on
              Sources.
            </Text>
            <HStack gap={2} wrap="wrap">
              {app.dependencies.length > 0 && (
                <Badge label="npm registry" variant="info" />
              )}
              {app.dependencies.some((d) => d.vulns.length > 0) && (
                <Badge label="GitHub Security Advisories" variant="info" />
              )}
              {app.hosting.some((h) => h.provider === 'Azure') && (
                <Badge label="Azure status / lifecycle" variant="info" />
              )}
              {app.hosting.some((h) => h.provider === 'AWS') && (
                <Badge label="AWS Health" variant="info" />
              )}
              {app.hosting.some((h) => h.provider === 'Cloudflare') && (
                <Badge label="Cloudflare status" variant="info" />
              )}
              {app.hosting.some((h) => h.provider === 'Vercel') && (
                <Badge label="Vercel status" variant="info" />
              )}
              {app.hasLicence && (
                <Badge label="Contract register" variant="info" />
              )}
              <Button
                label="Manage sources"
                variant="secondary"
                size="sm"
                href="/mockups/sources"
              />
            </HStack>
          </VStack>
        )}
      </VStack>
    </MockShell>
  );
}

export default function MockEditPage() {
  return (
    <Suspense
      fallback={
        <MockShell active="detail">
          <Text type="body">Loading…</Text>
        </MockShell>
      }>
      <DetailInner />
    </Suspense>
  );
}
