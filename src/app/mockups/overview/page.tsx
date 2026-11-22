'use client';

import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {HealthScore} from '../_components/HealthBits';
import {MockShell} from '../_components/MockShell';
import {
  MOCK_NOTICES,
  MOCK_ORG,
  averageHealth,
  appsByHealthAsc,
  severityBadgeVariant,
} from '../_data/seed';

export default function MockOverviewPage() {
  const avg = averageHealth();
  const atRisk = appsByHealthAsc().filter((a) => a.healthScore < 95);
  const critical = MOCK_NOTICES.filter((n) => n.severity === 'critical').slice(
    0,
    4,
  );

  return (
    <MockShell active="overview">
      <VStack gap={6}>
        <VStack gap={1}>
          <Heading level={1}>Overview</Heading>
          <Text type="body" color="secondary" display="block">
            {MOCK_ORG.name} · average health and what needs attention first
          </Text>
        </VStack>

        <HStack gap={6} wrap="wrap" vAlign="start">
          <VStack gap={2} padding={4} style={{minWidth: 240}}>
            <Text type="label" color="secondary">
              Average health
            </Text>
            <HealthScore score={avg} />
          </VStack>
          <VStack gap={2} padding={4} style={{minWidth: 240}}>
            <Text type="label" color="secondary">
              Apps needing attention
            </Text>
            <Heading level={2}>{atRisk.length}</Heading>
            <Text type="supporting" color="secondary" display="block">
              Score under 95 · sorted worst-first on Apps
            </Text>
          </VStack>
          <VStack gap={2} padding={4} style={{minWidth: 240}}>
            <Text type="label" color="secondary">
              Open critical notices
            </Text>
            <Heading level={2}>
              {MOCK_NOTICES.filter((n) => n.severity === 'critical').length}
            </Heading>
            <Button label="Open notices" variant="primary" href="/mockups/notices" />
          </VStack>
        </HStack>

        <VStack gap={3}>
          <Heading level={2}>Lowest-scoring apps</Heading>
          <VStack gap={2}>
            {atRisk.slice(0, 4).map((app) => (
              <HStack key={app.id} gap={4} vAlign="center" justify="between">
                <Link href={`/mockups/edit?id=${app.id}`}>{app.name}</Link>
                <HealthScore score={app.healthScore} size="sm" />
              </HStack>
            ))}
          </VStack>
        </VStack>

        <VStack gap={3}>
          <Heading level={2}>Latest critical notices</Heading>
          <VStack gap={2}>
            {critical.map((n) => (
              <HStack key={n.id} gap={3} vAlign="center" wrap="wrap">
                <Badge
                  label={n.severity}
                  variant={severityBadgeVariant(n.severity)}
                />
                <Text type="body" weight="medium">
                  {n.title}
                </Text>
                <Text type="supporting" color="secondary">
                  {n.apps.join(', ')}
                </Text>
              </HStack>
            ))}
          </VStack>
        </VStack>
      </VStack>
    </MockShell>
  );
}
