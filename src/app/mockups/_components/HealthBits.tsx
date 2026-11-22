'use client';

import {Badge} from '@astryxdesign/core/Badge';
import {HStack} from '@astryxdesign/core/HStack';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {
  healthVariant,
  severityBadgeVariant,
  type CategoryHealth,
  type Severity,
} from '../_data/seed';

/** Compact OK / attention / critical counts — short labels to avoid truncation. */
export function CategoryChecks({cat}: {cat: CategoryHealth}) {
  const bits: {label: string; severity: Severity}[] = [];
  if (cat.criticalCount > 0) {
    bits.push({label: `${cat.criticalCount} crit`, severity: 'critical'});
  }
  if (cat.attentionCount > 0) {
    bits.push({label: `${cat.attentionCount} attn`, severity: 'attention'});
  }
  if (bits.length === 0) {
    bits.push({label: 'OK', severity: 'ok'});
  }
  return (
    <HStack gap={1} wrap="wrap">
      {bits.map((b) => (
        <Badge
          key={`${cat.key}-${b.label}`}
          label={b.label}
          variant={severityBadgeVariant(b.severity)}
        />
      ))}
    </HStack>
  );
}

export function HealthScore({
  score,
  size = 'md',
}: {
  score: number;
  size?: 'sm' | 'md';
}) {
  return (
    <VStack gap={1} width={size === 'sm' ? 120 : 200}>
      <HStack gap={2} vAlign="center" justify="between">
        <Text type="label" weight="semibold">
          {score}
        </Text>
        <Text type="supporting" color="secondary">
          / 100
        </Text>
      </HStack>
      <ProgressBar
        label={`Health ${score}`}
        value={score}
        max={100}
        isLabelHidden
        variant={healthVariant(score)}
      />
    </VStack>
  );
}

export function LicenceBadge({
  hasLicence,
  label,
  status,
}: {
  hasLicence: boolean;
  label: string;
  status: Severity | null;
}) {
  if (!hasLicence || !status) {
    return (
      <Text type="body" color="secondary" weight="medium">
        —
      </Text>
    );
  }
  // Short labels only — never truncate mid-word in the table
  return <Badge label={label} variant={severityBadgeVariant(status)} />;
}
