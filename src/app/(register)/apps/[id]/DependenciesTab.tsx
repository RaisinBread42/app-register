'use client';

import {useState} from 'react';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Table} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import type {AppDetail, Dependency} from '@/lib/ui/api-client';
import {NOT_SET, orDash} from '@/lib/ui/copy';
import {dependencyToForm, type DependencyFormValues} from '@/lib/ui/forms';
import {removeDependencyAction, saveDependencyAction} from '../../actions';
import {EditDialog} from '../../_components/EditDialog';
import {FormError} from '../../_components/FormError';
import {useAction} from '../../_components/use-action';

type Props = {app: AppDetail; addKey: string; editKeys: Record<string, string>; isReadOnly: boolean};

/** Which dependency the dialog edits: `null` adds a new one; `undefined` means closed. */
type Editing = Dependency | null | undefined;

export function DependenciesTab({app, addKey, editKeys, isReadOnly}: Props) {
  const [editing, setEditing] = useState<Editing>(undefined);
  const [values, setValues] = useState<DependencyFormValues>(dependencyToForm());
  const save = useAction();
  const remove = useAction();
  const confirm = useImperativeAlertDialog();
  const set = (key: keyof DependencyFormValues) => (value: string) => setValues((current) => ({...current, [key]: value}));

  function open(dependency: Dependency | null) {
    save.clearError();
    setValues(dependencyToForm(dependency ?? undefined));
    setEditing(dependency);
  }

  function submit() {
    const key = editing ? editKeys[editing.id] : addKey;
    save.run(() => saveDependencyAction(key, app.id, editing?.id ?? null, values), () => setEditing(undefined));
  }

  function askToRemove(dependency: Dependency) {
    confirm.show({
      title: `Remove ${dependency.name}?`,
      description: 'It is taken off this app. You can add it again later.',
      actionLabel: 'Remove',
      onAction: () => {
        confirm.hide();
        remove.run(() => removeDependencyAction(app.id, dependency.id));
      },
    });
  }

  return (
    <VStack gap={4}>
      <HStack gap={3} justify="between" vAlign="center">
        <Text color="secondary">Packages and libraries this app is built on, recorded by hand.</Text>
        {!isReadOnly && <Button label="Add dependency" variant="secondary" onClick={() => open(null)} />}
      </HStack>
      <FormError error={remove.error} />
      <Table
        data={app.dependencies}
        idKey="id"
        hasHover
        density="balanced"
        emptyState={<EmptyState title="No dependencies recorded" isCompact />}
        columns={[
          {key: 'name', header: 'Package'},
          {key: 'currentVersion', header: 'Current'},
          {key: 'latestVersion', header: 'Latest', renderCell: (d: Dependency) => orDash(d.latestVersion)},
          {
            key: 'vulnerabilities',
            header: 'Known advisories',
            renderCell: (d: Dependency) => (d.vulnerabilities.length ? d.vulnerabilities.join(', ') : NOT_SET),
          },
          {key: 'recommendedAction', header: 'Action', renderCell: (d: Dependency) => orDash(d.recommendedAction)},
          {
            key: 'actions',
            header: '',
            renderCell: (d: Dependency) =>
              !isReadOnly && (
                <HStack gap={1} justify="end">
                  <Button label="Edit" variant="ghost" size="sm" onClick={() => open(d)} />
                  <Button label="Remove" variant="ghost" size="sm" onClick={() => askToRemove(d)} />
                </HStack>
              ),
          },
        ]}
      />
      <EditDialog
        title={editing ? `Edit ${editing.name}` : 'Add dependency'}
        isOpen={editing !== undefined}
        onClose={() => setEditing(undefined)}
        onSave={submit}
        isSaving={save.isPending}
        error={save.error}>
        <TextInput label="Package" value={values.name} onChange={set('name')} placeholder="e.g. next" isRequired />
        <HStack gap={3}>
          <TextInput label="Current version" value={values.currentVersion} onChange={set('currentVersion')} isRequired />
          <TextInput label="Latest version" value={values.latestVersion} onChange={set('latestVersion')} isOptional />
        </HStack>
        <TextInput
          label="Known advisories"
          description="Advisory ids separated by commas, e.g. CVE-2026-1234."
          value={values.vulnerabilities}
          onChange={set('vulnerabilities')}
          isOptional
        />
        <TextInput label="Recommended action" value={values.recommendedAction} onChange={set('recommendedAction')} isOptional />
      </EditDialog>
      {confirm.element}
    </VStack>
  );
}
