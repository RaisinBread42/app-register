'use client';

import {Badge} from '@astryxdesign/core/Badge';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {MockShell} from '../_components/MockShell';
import {MOCK_ORG} from '../_data/seed';

export default function MockSettingsPage() {
  return (
    <MockShell active="settings">
      <VStack gap={4} maxWidth={560}>
        <Heading level={1}>Settings</Heading>
        <Text type="body" color="secondary" display="block">
          Tenant preferences for {MOCK_ORG.name}. Placeholder for mockups —
          Leavers and Quarterly review stay hidden until Shannon asks for them.
        </Text>
        <Badge label="Demo only" variant="info" />
      </VStack>
    </MockShell>
  );
}
