'use client';

import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/VStack';

/** Shown when a page could not load its data from the API. Details stay in the server log. */
export default function RegisterError({reset}: {reset: () => void}) {
  return (
    <VStack gap={4} maxWidth={640}>
      <Banner
        status="error"
        title="This page could not load"
        description="The register's API did not answer. Try again in a moment."
        collapsible={false}
        endContent={<Button label="Try again" variant="secondary" size="sm" onClick={reset} />}
      />
    </VStack>
  );
}
