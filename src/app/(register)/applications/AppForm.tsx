'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {DateInput} from '@astryxdesign/core/DateInput';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {NOTICE_ALERT_OFFSET_DAYS, appRoute} from '@/lib/constants';
import {CRITICALITY_OPTIONS, ENVIRONMENT_OPTIONS, KIND_OPTIONS} from '@/lib/ui/copy';
import type {AppFormValues} from '@/lib/ui/forms';
import {updateAppAction} from '../actions';
import {FormError} from '../_components/FormError';
import {useAction} from '../_components/use-action';
import {isoDate} from '../_components/iso-date';

export type PersonOption = {value: string; label: string; description?: string};

type AppFormProps = {
  /** Rendered once per page view, so a double-click or retry of this Save reuses it. */
  idempotencyKey: string;
  initial: AppFormValues;
  people: PersonOption[];
  appId: string;
};

export function AppForm({idempotencyKey, initial, people, appId}: AppFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const {run, isPending, error} = useAction();
  const set = <K extends keyof AppFormValues>(key: K) => (value: AppFormValues[K]) =>
    setValues((current) => ({...current, [key]: value}));
  const text = (key: keyof AppFormValues) => (value: string | undefined) => set(key)(value ?? '');

  function save() {
    run(() => updateAppAction(idempotencyKey, appId, values), () => router.push(appRoute(appId)));
  }

  return (
    <VStack gap={6} maxWidth={640}>
      <FormLayout defaultOptionality="optional">
        <Heading level={2}>Identity and ownership</Heading>
        <TextInput label="Application name" value={values.name} onChange={text('name')} placeholder="e.g. Atlas Board" isRequired />
        <Selector label="Application type" options={KIND_OPTIONS} value={values.kind} onChange={text('kind')} isRequired />
        <Selector
          label="Owner"
          options={people}
          value={values.ownerId || undefined}
          onChange={text('ownerId')}
          hasSearch
          isRequired
        />
        <Selector
          label="Criticality"
          description="How much the business depends on it. Weighs its findings later."
          options={CRITICALITY_OPTIONS}
          value={values.criticality || null}
          onChange={(value) => set('criticality')(value ?? '')}
          hasClear
          placeholder="Not set"
        />
        <Selector
          label="Backup owner"
          description="Optional. A different person from the owner, who covers when they are away."
          options={people}
          value={values.backupOwnerId || null}
          onChange={(value) => set('backupOwnerId')(value ?? '')}
          hasSearch
          hasClear
          placeholder="No backup owner"
        />
        <CheckboxList label="Environments" description="Where it runs." value={values.environments} onChange={set('environments')}>
          {ENVIRONMENT_OPTIONS.map((option) => (
            <CheckboxListItem key={option.value} value={option.value} label={option.label} />
          ))}
        </CheckboxList>
        <TextInput label="Supplier" value={values.vendor} onChange={text('vendor')} />
        <TextInput
          label="Repository"
          description="Where the code lives, as an https:// address."
          value={values.repositoryUrl}
          onChange={text('repositoryUrl')}
          placeholder="https://github.com/your-org/your-app"
        />
        <TextInput label="Category" value={values.category} onChange={text('category')} placeholder="e.g. Finance, HR" />
        <TextArea label="Description" value={values.description} onChange={text('description')} />

        <Heading level={2}>Licence and dates</Heading>
        {/* Bottom-aligned, so the notice deadline's helper text does not push its input below the renewal date's. */}
        <HStack gap={3} wrap="wrap" vAlign="end">
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
          description="Optional. Most useful for in-house and citizen-built apps."
          value={values.runtimeLocation}
          onChange={text('runtimeLocation')}
        />
        <TextArea
          label="Data and keys it touches"
          description="Optional. Most useful for in-house and citizen-built apps."
          value={values.dataAndKeys}
          onChange={text('dataAndKeys')}
        />
        <TextArea
          label="What breaks if it stops"
          description="Optional. Most useful for in-house and citizen-built apps."
          value={values.whatBreaksIfStopped}
          onChange={text('whatBreaksIfStopped')}
        />
      </FormLayout>
      <FormError error={error} />
      <HStack gap={2}>
        <Button label="Save changes" variant="primary" isLoading={isPending} onClick={save} />
        <Button label="Cancel" href={appRoute(appId)} />
      </HStack>
    </VStack>
  );
}
