'use client';

import {useState} from 'react';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {FileInput} from '@astryxdesign/core/FileInput';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Table, proportional} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {VStack} from '@astryxdesign/core/VStack';
import {DEPENDENCY_IMPORT_MAX_BYTES} from '@/lib/constants';
import type {AppDetail, Dependency, DependencyImport} from '@/lib/ui/api-client';
import {NOT_SET, SEVERITY_VARIANT, orDash} from '@/lib/ui/copy';
import {dependencyToForm, type DependencyFormValues} from '@/lib/ui/forms';
import {formatDate, handRecordedAdvisories, lastChecked, statusNote, worstAdvisoriesFirst} from '@/lib/ui/register-view';
import {importDependenciesAction, refreshDependenciesAction, removeDependencyAction, saveDependencyAction} from '../../actions';
import {FootNote, PanelCard} from '../../_components/Cards';
import {EditDialog} from '../../_components/EditDialog';
import {FormError} from '../../_components/FormError';
import {CheckPill} from '../../_components/Health';
import {useAction} from '../../_components/use-action';

type Props = {app: AppDetail; addKey: string; importKey: string; editKeys: Record<string, string>; isReadOnly: boolean};

/** Which dependency the dialog edits: `null` adds a new one; `undefined` means closed. */
type Editing = Dependency | null | undefined;

const column = (share: number) => proportional(share, {minWidth: 100});

/** How many advisory badges one row shows before "+N more". */
const ADVISORIES_SHOWN = 3;

const IMPORT_LABEL = 'Import package.json / package-lock.json';
const PACKAGE_FILE_TYPES = '.json,application/json';

export function DependenciesTab({app, addKey, importKey, editKeys, isReadOnly}: Props) {
  const [editing, setEditing] = useState<Editing>(undefined);
  const [values, setValues] = useState<DependencyFormValues>(dependencyToForm());
  const [isImporting, setIsImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [imported, setImported] = useState<DependencyImport | null>(null);
  const save = useAction();
  const remove = useAction();
  const importFile = useAction();
  const refresh = useAction();
  const confirm = useImperativeAlertDialog();
  const set = (key: keyof DependencyFormValues) => (value: string) => setValues((current) => ({...current, [key]: value}));
  const checkedOn = lastChecked(app.dependencies);

  function open(dependency: Dependency | null) {
    save.clearError();
    setValues(dependencyToForm(dependency ?? undefined));
    setEditing(dependency);
  }

  function submit() {
    const key = editing ? editKeys[editing.id] : addKey;
    save.run(() => saveDependencyAction(key, app.id, editing?.id ?? null, values), () => setEditing(undefined));
  }

  function openImport() {
    importFile.clearError();
    setFile(null);
    setIsImporting(true);
  }

  function submitImport() {
    if (!file) {
      return;
    }
    importFile.run(
      async () => importDependenciesAction(importKey, app.id, await file.text()),
      (result) => {
        setImported(result.summary ?? null);
        setIsImporting(false);
      },
    );
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
    <PanelCard
      title="Dependencies"
      subtitle="Frameworks, packages, versions, security advisories and end-of-life notices"
      action={
        !isReadOnly && (
          <HStack gap={2}>
            {app.dependencies.length > 0 && (
              <Button label="Check now" size="sm" variant="ghost" isLoading={refresh.isPending} onClick={() => refresh.run(() => refreshDependenciesAction(app.id))} />
            )}
            <Button label={IMPORT_LABEL} size="sm" onClick={openImport} />
            <Button label="Add dependency" size="sm" onClick={() => open(null)} />
          </HStack>
        )
      }>
      <VStack gap={3}>
        {imported && (
          <Banner
            status="success"
            title="Import finished"
            description={`${imported.added} added, ${imported.updated} updated, ${imported.removed} removed, ${imported.unchanged} unchanged.`}
            collapsible={false}
            isDismissable
            onDismiss={() => setImported(null)}
          />
        )}
        <FormError error={remove.error ?? refresh.error} />
        <Table
          data={app.dependencies}
          idKey="id"
          hasHover
          emptyState={
            <EmptyState
              title="No dependencies recorded"
              description="Import this application's package.json or package-lock.json, or add packages by hand."
              isCompact
            />
          }
          columns={[
            {key: 'name', header: 'Dependency', width: proportional(5, {minWidth: 220}), renderCell: (d: Dependency) => <NameCell dependency={d} />},
            {key: 'currentVersion', header: 'Tracked version', width: column(2)},
            {key: 'latestVersion', header: 'Latest available', width: column(2), renderCell: (d: Dependency) => orDash(d.latestVersion)},
            {key: 'advisories', header: 'Advisories', width: column(3), renderCell: (d: Dependency) => <AdvisoriesCell dependency={d} />},
            {key: 'status', header: 'Status', width: column(3), renderCell: (d: Dependency) => <StatusCell dependency={d} />},
            {
              key: 'actions',
              header: '',
              width: column(3),
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
        <FootNote>
          {`Latest versions come from the npm registry and advisories from OSV.dev, checked daily and after every change. ${
            checkedOn ? `Last checked ${formatDate(checkedOn)}.` : 'Not checked yet.'
          }`}
        </FootNote>
      </VStack>
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
          <TextInput
            label="Latest version"
            description="Filled in from the npm registry when the package is found there."
            value={values.latestVersion}
            onChange={set('latestVersion')}
            isOptional
          />
        </HStack>
        <TextInput
          label="Known advisories"
          description="Advisory ids separated by commas, e.g. CVE-2026-1234. Advisories OSV knows are added for you."
          value={values.vulnerabilities}
          onChange={set('vulnerabilities')}
          isOptional
        />
        <TextInput label="Recommended action" value={values.recommendedAction} onChange={set('recommendedAction')} isOptional />
      </EditDialog>
      <EditDialog
        title={IMPORT_LABEL}
        isOpen={isImporting}
        onClose={() => setIsImporting(false)}
        onSave={submitImport}
        isSaving={importFile.isPending}
        error={importFile.error}
        saveLabel="Import">
        <FileInput
          label="Package file"
          description="package-lock.json gives exact installed versions; package.json works too. Only direct dependencies are imported."
          accept={PACKAGE_FILE_TYPES}
          maxSize={DEPENDENCY_IMPORT_MAX_BYTES}
          value={file}
          onChange={(picked) => setFile(Array.isArray(picked) ? (picked[0] ?? null) : picked)}
          mode="dropzone"
          isRequired
        />
        <FootNote>
          Packages no longer in the file are removed only if an earlier import added them. Dependencies you added by hand stay.
        </FootNote>
      </EditDialog>
      {confirm.element}
    </PanelCard>
  );
}

function NameCell({dependency}: {dependency: Dependency}) {
  return (
    <VStack gap={0.5}>
      <HStack gap={2} vAlign="center">
        <Text weight="bold" size="sm">
          {dependency.name}
        </Text>
        {dependency.isDev && <Badge label="dev" variant="neutral" />}
      </HStack>
      {dependency.recommendedAction && (
        <Text type="supporting" color="secondary">
          {dependency.recommendedAction}
        </Text>
      )}
    </VStack>
  );
}

/** The worst advisories monitoring found (coloured by severity, linked to OSV), a count of the rest, then ids recorded by hand. */
function AdvisoriesCell({dependency}: {dependency: Dependency}) {
  const byHand = handRecordedAdvisories(dependency);
  if (dependency.advisories.length + byHand.length === 0) {
    return NOT_SET;
  }
  const shown = worstAdvisoriesFirst(dependency.advisories).slice(0, ADVISORIES_SHOWN);
  const hidden = dependency.advisories.length - shown.length;
  return (
    <HStack gap={1} wrap="wrap">
      {shown.map((advisory) => (
        <Link key={advisory.id} href={advisory.url} target="_blank" rel="noreferrer" tooltip={`${advisory.severity}: ${advisory.summary}`}>
          <Badge label={advisory.id} variant={SEVERITY_VARIANT[advisory.severity]} />
        </Link>
      ))}
      {hidden > 0 && <Badge label={`+${hidden} more`} variant="neutral" />}
      {byHand.map((id) => (
        <Tooltip key={id} content="Recorded by hand">
          <Badge label={id} variant="yellow" />
        </Tooltip>
      ))}
    </HStack>
  );
}

/** The status pill, with the reason beside it when a check failed, could not be done, or has not run yet. */
function StatusCell({dependency}: {dependency: Dependency}) {
  const note = statusNote(dependency);
  return (
    <HStack gap={1} vAlign="center" wrap="wrap">
      <CheckPill status={dependency.status} />
      {note && <Badge label={note} variant="neutral" />}
    </HStack>
  );
}
