'use client';

import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/VStack';
import {Heading, Text} from '@astryxdesign/core/Text';
import {PRODUCT_NAME, PRODUCT_TAGLINE} from '@/lib/constants';

export default function HomePage() {
  return (
    <VStack gap={5} padding={8} minHeight="100vh" justify="center" maxWidth={640}>
      <VStack gap={2}>
        <Heading level={1}>{PRODUCT_NAME}</Heading>
        <Text type="body" color="secondary" display="block">
          {PRODUCT_TAGLINE}
        </Text>
        <Text type="supporting" color="secondary" display="block">
          Obsidian Software — bought SaaS and in-house apps in one register. Flat
          price. Live from your spreadsheet in an afternoon.
        </Text>
      </VStack>
      <Button label="Scaffold ready" variant="primary" />
    </VStack>
  );
}
