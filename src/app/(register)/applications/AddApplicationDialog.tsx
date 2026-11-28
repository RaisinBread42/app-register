'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Selector} from '@astryxdesign/core/Selector';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useToast} from '@astryxdesign/core/Toast';
import {APP_KINDS, ROUTES, appRoute} from '@/lib/constants';
import {CRITICALITY_OPTIONS, KIND_OPTIONS} from '@/lib/ui/copy';
import {emptyAppForm, type AppFormValues} from '@/lib/ui/forms';
import {createAppAction} from '../actions';
import {EditDialog} from '../_components/EditDialog';
import {useAction} from '../_components/use-action';
import type {PersonOption} from './AppForm';

const CRITICALITY_REQUIRED = 'Criticality: choose Low, Medium, High or Critical, how much the business depends on it.';

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
  const [missing, setMissing] = useState<string | null>(null);

  function close() {
    clearError();
    setMissing(null);
    onClose();
  }

  function add() {
    // The API accepts an app without criticality (older clients); the form asks for it up front (Journey B).
    if (!values.criticality) {
      setMissing(CRITICALITY_REQUIRED);
      return;
    }
    setMissing(null);
    run(
      () => createAppAction(idempotencyKey, values),
      (result) => {
        setValues(emptyAppForm(APP_KINDS[0]));
        onClose();
        showToast({body: `${values.name.trim()} added to the register`});
        // Its page shows the setup checklist: what to add so it can be watched (Journey B).
        router.push(result.appId ? appRoute(result.appId) : ROUTES.applications);
        router.refresh();
      },
    );
  }

  return (
    <EditDialog
      title="Add application"
      subtitle="Name, type, criticality and owner are enough to start. Everything else can be added later."
      isOpen={isOpen}
      onClose={close}
      onSave={add}
      isSaving={isPending}
      error={missing ?? error}
      saveLabel="Add application">
      <FormLayout defaultOptionality="required">
        <TextInput label="Application name" value={values.name} onChange={text('name')} placeholder="e.g. Customer Portal" hasAutoFocus />
        <Selector label="Application type" options={KIND_OPTIONS} value={values.kind} onChange={text('kind')} />
        <Selector
          label="Criticality"
          description="How much the business depends on it."
          options={CRITICALITY_OPTIONS}
          value={values.criticality || undefined}
          onChange={text('criticality')}
          placeholder="Choose a level"
          status={missing ? {type: 'error', message: missing} : undefined}
        />
        <Selector label="Owner" options={people} value={values.ownerId || undefined} onChange={text('ownerId')} hasSearch placeholder="Choose a person" />
        <Selector
          label="Backup owner"
          options={people}
          value={values.backupOwnerId || null}
          onChange={text('backupOwnerId')}
          hasSearch
          hasClear
          placeholder="No backup owner"
          isOptional
        />
        <TextInput label="Category" value={values.category} onChange={text('category')} placeholder="e.g. Operations" isOptional />
      </FormLayout>
    </EditDialog>
  );
}
