import {Spinner} from '@astryxdesign/core/Spinner';
import {VStack} from '@astryxdesign/core/VStack';

/** Shown while the applications list loads its data, so a click in the side nav answers at once (spec §6: every state says what is happening). */
export default function ApplicationsLoading() {
  return (
    <VStack padding={10} hAlign="center" vAlign="center" minHeight="50vh">
      <Spinner size="lg" label="Loading…" />
    </VStack>
  );
}
