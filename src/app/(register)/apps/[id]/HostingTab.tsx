'use client';

import {useState} from 'react';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {Button} from '@astryxdesign/core/Button';
import {DateInput} from '@astryxdesign/core/DateInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Table} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import type {AppDetail, Hosting} from '@/lib/ui/api-client';
import {orDash} from '@/lib/ui/copy';
import {hostingToForm, type HostingFormValues} from '@/lib/ui/forms';
import {removeHostingAction, saveHostingAction} from '../../actions';
import {EditDialog} from '../../_components/EditDialog';
import {FormError} from '../../_components/FormError';
import {useAction} from '../../_components/use-action';
import {isoDate} from '../../_components/iso-date';

type Props = {app: AppDetail; addKey: string; editKeys: Record<string, string>; isReadOnly: boolean};

/** Which hosting entry the dialog edits: `null` adds a new one; `undefined` means closed. */
type Editing = Hosting | null | undefined;

export function HostingTab({app, addKey, editKeys, isReadOnly}: Props) {
  const [editing, setEditing] = useState<Editing>(undefined);
  const [values, setValues] = useState<HostingFormValues>(hostingToForm());
  const save = useAction();
  const remove = useAction();
  const confirm = useImperativeAlertDialog();
  const set = (key: keyof HostingFormValues) => (value: string | undefined) =>
    setValues((current) => ({...current, [key]: value ?? ''}));

  function open(hosting: Hosting | null) {
    save.clearError();
    setValues(hostingToForm(hosting ?? undefined));
    setEditing(hosting);
  }

  function submit() {
    const key = editing ? editKeys[editing.id] : addKey;
    save.run(() => saveHostingAction(key, app.id, editing?.id ?? null, values), () => setEditing(undefined));
  }

  function askToRemove(hosting: Hosting) {
    confirm.show({
      title: `Remove ${hosting.provider} ${hosting.service}?`,
      description: 'It is taken off this app. You can add it again later.',
      actionLabel: 'Remove',
      onAction: () => {
        confirm.hide();
        remove.run(() => removeHostingAction(app.id, hosting.id));
      },
    });
  }

  return (
    <VStack gap={4}>
      <HStack gap={3} justify="between" vAlign="center">
        <Text color="secondary">Where this app runs: provider, service, region and support dates.</Text>
        {!isReadOnly && <Button label="Add hosting" variant="secondary" onClick={() => open(null)} />}
      </HStack>
      <FormError error={remove.error} />
      <Table
        data={app.hosting}
        idKey="id"
        hasHover
        density="balanced"
        emptyState={<EmptyState title="No hosting recorded" isCompact />}
        columns={[
          {key: 'provider', header: 'Provider'},
          {key: 'service', header: 'Service'},
          {key: 'region', header: 'Region', renderCell: (h: Hosting) => orDash(h.region)},
          {key: 'version', header: 'Version', renderCell: (h: Hosting) => orDash(h.version)},
          {key: 'endOfSupportOn', header: 'End of support', renderCell: (h: Hosting) => orDash(h.endOfSupportOn)},
          {
            key: 'actions',
            header: '',
            renderCell: (h: Hosting) =>
              !isReadOnly && (
                <HStack gap={1} justify="end">
                  <Button label="Edit" variant="ghost" size="sm" onClick={() => open(h)} />
                  <Button label="Remove" variant="ghost" size="sm" onClick={() => askToRemove(h)} />
                </HStack>
              ),
          },
        ]}
      />
      <EditDialog
        title={editing ? `Edit ${editing.provider} ${editing.service}` : 'Add hosting'}
        isOpen={editing !== undefined}
        onClose={() => setEditing(undefined)}
        onSave={submit}
        isSaving={save.isPending}
        error={save.error}>
        <HStack gap={3}>
          <TextInput label="Provider" value={values.provider} onChange={set('provider')} placeholder="e.g. Azure" isRequired />
          <TextInput label="Service" value={values.service} onChange={set('service')} placeholder="e.g. App Service" isRequired />
        </HStack>
        <HStack gap={3}>
          <TextInput label="Region" value={values.region} onChange={set('region')} isOptional />
          <TextInput label="Version" value={values.version} onChange={set('version')} isOptional />
        </HStack>
        <DateInput
          label="End of support"
          value={isoDate(values.endOfSupportOn)}
          onChange={set('endOfSupportOn')}
          hasClear
          isOptional
        />
      </EditDialog>
      {confirm.element}
    </VStack>
  );
}
