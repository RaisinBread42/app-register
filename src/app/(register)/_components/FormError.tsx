'use client';

import {Banner} from '@astryxdesign/core/Banner';

/** The API's message for a refused save, shown next to the form. */
export function FormError({error}: {error: string | null}) {
  if (!error) {
    return null;
  }
  return <Banner status="error" title="Not saved" description={error} collapsible={false} />;
}
