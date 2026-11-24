'use client';

import {useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Selector} from '@astryxdesign/core/Selector';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {MockShell} from '../_components/MockShell';
import {MOCK_ORG, MOCK_PEOPLE, personOptions} from '../_data/seed';

/**
 * [05] Leaver flow — step 1: pick who is leaving.
 * Static mockup for design review; no product wiring.
 */
export default function MockLeaverPickPage() {
  const [personId, setPersonId] = useState<string | null>(null);
  const leaving = MOCK_PEOPLE.filter((p) => p.status === 'leaving');

  return (
    <MockShell active="leaver">
      <VStack gap={5}>
        <HStack gap={4} vAlign="end" justify="between" wrap="wrap">
          <VStack gap={1}>
            <Heading level={1}>Leaver checklist</Heading>
            <Text type="body" color="secondary" display="block">
              {MOCK_ORG.name} · list every app someone owns or backs up, then
              reassign so both roles stay filled
            </Text>
          </VStack>
        </HStack>

        {leaving.length > 0 && (
          <Banner
            status="warning"
            title={`${leaving[0].name} is marked as leaving`}
            description="Open their checklist to reassign ownership before their last day."
            endContent={
              <Button
                label="Open checklist"
                variant="primary"
                size="sm"
                href="/mockups/leaver/checklist"
              />
            }
          />
        )}

        <Selector
          label="Who is leaving?"
          description="Active people and anyone already marked as leaving."
          options={personOptions()}
          value={personId}
          onChange={setPersonId}
          hasClear
          hasSearch
          placeholder="Search by name"
          width={360}
          isRequired
        />

        <EmptyState
          title="Pick a person to continue"
          description="We will show every app where they are owner or backup. Reassignment keeps both roles filled — you cannot leave an owner empty."
          actions={
            <Button
              label="Use Priya Chen (demo)"
              variant="secondary"
              href="/mockups/leaver/checklist"
            />
          }
        />
      </VStack>
    </MockShell>
  );
}
