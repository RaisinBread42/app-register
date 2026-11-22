'use client';

import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {MockShell} from '../_components/MockShell';
import {MOCK_ORG} from '../_data/seed';

export default function MockEmptyPage() {
  return (
    <MockShell active="apps">
      <VStack gap={5}>
        <VStack gap={1}>
          <Heading level={1}>Apps</Heading>
          <Text type="body" color="secondary" display="block">
            {MOCK_ORG.name} · nothing in the register yet
          </Text>
        </VStack>
        <EmptyState
          title="No apps yet"
          description="Import a CSV from your spreadsheet, or add the first app by hand. Live in an afternoon."
          actions={
            <>
              <Button label="Add app" variant="primary" href="/mockups/create" />
              <Button label="Import CSV (later)" variant="secondary" isDisabled />
            </>
          }
        />
      </VStack>
    </MockShell>
  );
}
