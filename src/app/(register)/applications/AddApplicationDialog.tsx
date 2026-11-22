'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@astryxdesign/core/Button';
import {Dialog} from '@astryxdesign/core/Dialog';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Selector} from '@astryxdesign/core/Selector';
import {Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useToast} from '@astryxdesign/core/Toast';
import {VStack} from '@astryxdesign/core/VStack';
import {APP_KINDS, ROUTES, RUNTIME_DETAIL_KINDS, type AppKind} from '@/lib/constants';
import {KIND_OPTIONS} from '@/lib/ui/copy';
import {emptyAppForm, type AppFormValues} from '@/lib/ui/forms';
import {createAppAction} from '../actions';
import {FormError} from '../_components/FormError';
import {useAction} from '../_components/use-action';
import type {PersonOption} from './AppForm';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Rendered with the page: a double-click or retry of this Add sends the same key; a successful add reloads the page, which renders a new one. */
  idempotencyKey: string;
  people: PersonOption[];
};

/** The prototype's "Add application" modal, collecting what the API needs for a new app. */
export function AddApplicationDialog({isOpen, onClose, idempotencyKey, people}: Props) {
  const router = useRouter();
  const showToast = useToast();
  const [values, setValues] = useState<AppFormValues>(emptyAppForm(APP_KINDS[0]));
  const {run, isPending, error, clearError} = useAction();
  const text = (key: keyof AppFormValues) => (value: string | null | undefined) =>
    setValues((current) => ({...current, [key]: value ?? ''}));
  const needsRuntime = RUNTIME_DETAIL_KINDS.includes(values.kind as AppKind);

  function close() {
    clearError();
    onClose();
  }

  function add() {
    run(
      () => createAppAction(idempotencyKey, values),
      () => {
        setValues(emptyAppForm(APP_KINDS[0]));
        onClose();
        showToast({body: `${values.name.trim()} added to the register`});
        router.push(ROUTES.applications);
        router.refresh();
      },
    );
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && close()} purpose="form" width={510} padding={6}>
      <VStack gap={5}>
        <VStack gap={1}>
          <Heading level={2} style={{fontSize: 'var(--font-size-2xl)'}}>
            Add application
          </Heading>
          <Text color="secondary">Add an application to the register. Dates and costs can be added with Edit application.</Text>
        </VStack>
        <FormLayout defaultOptionality="required">
          <TextInput label="Application name" value={values.name} onChange={text('name')} placeholder="e.g. Customer Portal" hasAutoFocus />
          <Selector label="Application type" options={KIND_OPTIONS} value={values.kind} onChange={text('kind')} />
          <Selector label="Owner" options={people} value={values.ownerId || undefined} onChange={text('ownerId')} hasSearch placeholder="Choose a person" />
          <Selector
            label="Backup owner"
            options={people}
            value={values.backupOwnerId || undefined}
            onChange={text('backupOwnerId')}
            hasSearch
            placeholder="Choose a person"
          />
          <TextInput label="Category" value={values.category} onChange={text('category')} placeholder="e.g. Operations" isOptional />
          {needsRuntime && (
            <>
              <TextInput label="Where it runs" value={values.runtimeLocation} onChange={text('runtimeLocation')} />
              <TextArea label="Data and keys it touches" value={values.dataAndKeys} onChange={text('dataAndKeys')} />
              <TextArea label="What breaks if it stops" value={values.whatBreaksIfStopped} onChange={text('whatBreaksIfStopped')} />
            </>
          )}
        </FormLayout>
        <FormError error={error} />
        <HStack gap={2} hAlign="end">
          <Button label="Cancel" onClick={close} />
          <Button label="Add application" variant="primary" isLoading={isPending} onClick={add} />
        </HStack>
      </VStack>
    </Dialog>
  );
}
