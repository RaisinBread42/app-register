'use client';

import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Selector} from '@astryxdesign/core/Selector';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {MockShell} from '../../_components/MockShell';
import {MOCK_ORG, MOCK_PEOPLE, personOptions} from '../../_data/seed';

const LEAVER = MOCK_PEOPLE.find((p) => p.id === 'p1')!;

/**
 * [05] Leaver flow — empty state after every owned/backup app is reassigned.
 */
export default function MockLeaverDonePage() {
  return (
    <MockShell active="leaver">
      <VStack gap={5}>
        <HStack gap={4} vAlign="end" justify="between" wrap="wrap">
          <VStack gap={1}>
            <Heading level={1}>Leaver checklist</Heading>
            <Text type="body" color="secondary" display="block">
              {MOCK_ORG.name} · nothing left to reassign for this person
            </Text>
          </VStack>
          <Button
            label="Pick another person"
            variant="secondary"
            href="/mockups/leaver"
          />
        </HStack>

        <Banner
          status="success"
          title={`All apps reassigned for ${LEAVER.name}`}
          description="Owner and backup are filled on every former app. They no longer appear on this checklist."
        />

        <Selector
          label="Who is leaving?"
          options={personOptions()}
          value={LEAVER.id}
          onChange={() => undefined}
          width={360}
          isRequired
        />

        <EmptyState
          title="All reassigned"
          description={`${LEAVER.name} no longer owns or backs up any app in the register. Mark them as left when their last day arrives, or pick someone else.`}
          actions={
            <>
              <Button
                label="Mark as left (later)"
                variant="primary"
                isDisabled
              />
              <Button
                label="Back to pick person"
                variant="secondary"
                href="/mockups/leaver"
              />
            </>
          }
        />
      </VStack>
    </MockShell>
  );
}
