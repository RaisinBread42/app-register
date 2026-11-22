'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@astryxdesign/core/Button';
import {DateInput} from '@astryxdesign/core/DateInput';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {NOTICE_ALERT_OFFSET_DAYS, ROUTES, appRoute} from '@/lib/constants';
import {KIND_OPTIONS} from '@/lib/ui/copy';
import type {AppFormValues} from '@/lib/ui/forms';
import {createAppAction, updateAppAction} from '../actions';
import {FormError} from '../_components/FormError';
import {useAction} from '../_components/use-action';
import {isoDate} from '../_components/iso-date';

export type PersonOption = {value: string; label: string; description?: string};

type AppFormProps = {
  /** Rendered once per page view, so a double-click or retry of this Save reuses it. */
  idempotencyKey: string;
  initial: AppFormValues;
  people: PersonOption[];
  /** Set when editing an existing app. */
  appId?: string;
};

export function AppForm({idempotencyKey, initial, people, appId}: AppFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const {run, isPending, error} = useAction();
  const set = <K extends keyof AppFormValues>(key: K) => (value: AppFormValues[K]) =>
    setValues((current) => ({...current, [key]: value}));
  const text = (key: keyof AppFormValues) => (value: string | undefined) => set(key)(value ?? '');

  function save() {
    if (appId) {
      run(() => updateAppAction(idempotencyKey, appId, values), () => router.push(appRoute(appId)));
    } else {
      run(
        () => createAppAction(idempotencyKey, values),
        (result) => router.push(result.appId ? appRoute(result.appId) : ROUTES.apps),
      );
    }
  }

  return (
    <VStack gap={6} maxWidth={640}>
      <FormLayout defaultOptionality="optional">
        <Heading level={2}>Identity and ownership</Heading>
        <TextInput label="App name" value={values.name} onChange={text('name')} placeholder="e.g. Atlas Board" isRequired />
        <Selector label="Kind" options={KIND_OPTIONS} value={values.kind} onChange={text('kind')} isRequired />
        <Selector
          label="Owner"
          options={people}
          value={values.ownerId || undefined}
          onChange={text('ownerId')}
          hasSearch
          isRequired
        />
        <Selector
          label="Backup owner"
          description="Must be a different person from the owner."
          options={people}
          value={values.backupOwnerId || undefined}
          onChange={text('backupOwnerId')}
          hasSearch
          isRequired
        />
        <TextInput label="Vendor" value={values.vendor} onChange={text('vendor')} />
        <TextInput label="Category" value={values.category} onChange={text('category')} placeholder="e.g. Finance, HR" />
        <TextArea label="Description" value={values.description} onChange={text('description')} />

        <Heading level={2}>Licence and dates</Heading>
        <HStack gap={3} wrap="wrap">
          <DateInput
            label="Notice deadline"
            description={`Last day to give notice. Alerts go out ${NOTICE_ALERT_OFFSET_DAYS.join(', ')} days before.`}
            value={isoDate(values.noticeDeadline)}
            onChange={text('noticeDeadline')}
            hasClear
          />
          <DateInput
            label="Renewal date"
            value={isoDate(values.renewalDate)}
            onChange={text('renewalDate')}
            hasClear
          />
        </HStack>
        <HStack gap={3} wrap="wrap">
          <NumberInput label="Cost" value={values.cost} onChange={(cost) => set('cost')(Number.isFinite(cost) ? cost : null)} min={0} step={0.01} hasClear />
          <TextInput
            label="Billing cycle"
            value={values.billingCycle}
            onChange={text('billingCycle')}
            placeholder="e.g. annual"
          />
        </HStack>

        <Heading level={2}>Runtime</Heading>
        <TextInput
          label="Where it runs"
          description="Required for in-house and citizen-built apps."
          value={values.runtimeLocation}
          onChange={text('runtimeLocation')}
        />
        <TextArea
          label="Data and keys it touches"
          description="Required for in-house and citizen-built apps."
          value={values.dataAndKeys}
          onChange={text('dataAndKeys')}
        />
        <TextArea
          label="What breaks if it stops"
          description="Required for in-house and citizen-built apps."
          value={values.whatBreaksIfStopped}
          onChange={text('whatBreaksIfStopped')}
        />
      </FormLayout>
      <FormError error={error} />
      <HStack gap={2}>
        <Button label={appId ? 'Save changes' : 'Save app'} variant="primary" isLoading={isPending} onClick={save} />
        <Button label="Cancel" variant="ghost" href={appId ? appRoute(appId) : ROUTES.apps} />
      </HStack>
    </VStack>
  );
}
