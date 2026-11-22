'use client';

import {Button} from '@astryxdesign/core/Button';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {MockShell} from './_components/MockShell';

export default function MockupsIndexPage() {
  return (
    <MockShell active="home">
      <VStack gap={4} maxWidth={560}>
        <Heading level={1}>[03] UI mockups</Heading>
        <Text type="body" color="secondary" display="block">
          Throwaway Astryx screens for Shannon to approve before building issue
          #6. Fictional Meridian Labs data only.
        </Text>
        <VStack gap={2}>
          <Button label="1 · App list" variant="primary" href="/mockups/list" />
          <Button label="2 · Create app" variant="secondary" href="/mockups/create" />
          <Button
            label="3 · Edit app (Nimbus Mail)"
            variant="secondary"
            href="/mockups/edit?id=a1"
          />
          <Button label="4 · Empty state" variant="ghost" href="/mockups/empty" />
        </VStack>
      </VStack>
    </MockShell>
  );
}
