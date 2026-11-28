'use client';

import {Banner} from '@astryxdesign/core/Banner';
import {VStack} from '@astryxdesign/core/VStack';

/** The API's message for a refused save, shown next to the form and announced (a Banner alone is not a live region). */
export function FormError({error}: {error: string | null}) {
  if (!error) {
    return null;
  }
  return (
    <VStack role="alert">
      <Banner status="error" title="Not saved" description={error} collapsible={false} />
    </VStack>
  );
}
