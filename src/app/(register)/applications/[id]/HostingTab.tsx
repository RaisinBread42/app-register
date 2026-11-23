'use client';

import {useState} from 'react';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {DateInput} from '@astryxdesign/core/DateInput';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Selector} from '@astryxdesign/core/Selector';
import {Table} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {END_OF_SUPPORT_SOURCE} from '@/lib/constants';
import type {AppDetail, Hosting, HostingCatalog} from '@/lib/ui/api-client';
import {NOT_CHECKED_YET, NOT_SET, orDash} from '@/lib/ui/copy';
import {
  checkErrors,
  endOfSupportNote,
  formatDate,
  formatDateTime,
  hostingLastChecked,
  hostingStatusReason,
  hostingVersion,
  openIncidents,
  type IncidentRow,
} from '@/lib/ui/register-view';
import {hostingToForm, type HostingFormValues} from '@/lib/ui/forms';
import {refreshHostingAction, removeHostingAction, saveHostingAction} from '../../actions';
import {FootNote, KeyValueRows, PanelCard} from '../../_components/Cards';
import {EditDialog} from '../../_components/EditDialog';
import {FormError} from '../../_components/FormError';
import {CheckPill, DimensionPill} from '../../_components/Health';
import {useAction} from '../../_components/use-action';
import {isoDate} from '../../_components/iso-date';

type Props = {
  app: AppDetail;
  catalog: HostingCatalog;
  today: string;
  addKey: string;
  editKeys: Record<string, string>;
  isReadOnly: boolean;
};

/** Which hosting entry the dialog edits: `null` adds a new one; `undefined` means closed. */
type Editing = Hosting | null | undefined;

/** Selector choice that swaps the list for a free-text field. */
const OTHER = 'Other';

export function HostingTab({app, catalog, today, addKey, editKeys, isReadOnly}: Props) {
  const [editing, setEditing] = useState<Editing>(undefined);
  const [values, setValues] = useState<HostingFormValues>(hostingToForm());
  const save = useAction();
  const remove = useAction();
  const refresh = useAction();
  const confirm = useImperativeAlertDialog();
  const incidents = openIncidents(app.hosting);
  const checkedAt = hostingLastChecked(app.hosting);
  const errors = checkErrors(app.hosting);

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
      <PanelCard
        title="Hosting & infrastructure"
        subtitle="Providers, services, regions and relevant platform notices"
        action={
          !isReadOnly && (
            <HStack gap={2}>
              {app.hosting.length > 0 && (
                <Button
                  label="Check now"
                  size="sm"
                  isLoading={refresh.isPending}
                  onClick={() => refresh.run(() => refreshHostingAction(app.id))}
                />
              )}
              <Button label="Add hosting" variant="primary" size="sm" onClick={() => open(null)} />
            </HStack>
          )
        }>
        <VStack gap={3}>
          <FormError error={remove.error ?? refresh.error} />
          {errors.length > 0 && (
            <Banner
              status="warning"
              title="Some sources could not be read on the last check"
              description={`${errors.join('. ')}. What earlier checks found is still shown; a row with nothing found shows no status until its next check.`}
              collapsible={false}
            />
          )}
          <Table
            data={app.hosting}
            idKey="id"
            hasHover
            emptyState={<EmptyState title="No hosting recorded" description="Add where this application runs: provider, service and region." isCompact />}
            columns={[
              {key: 'provider', header: 'Provider'},
              {key: 'service', header: 'Service'},
              {key: 'region', header: 'Region', renderCell: (h: Hosting) => orDash(h.region)},
              {key: 'version', header: 'Version / runtime', renderCell: (h: Hosting) => orDash(hostingVersion(h))},
              {key: 'endOfSupportOn', header: 'End of support', renderCell: (h: Hosting) => <EndOfSupport hosting={h} today={today} />},
              {key: 'status', header: 'Status', renderCell: (h: Hosting) => <RowStatus hosting={h} />},
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
          <KeyValueRows
            rows={[
              {label: 'Infrastructure status', value: <DimensionPill dimension={app.health.dimensions.hosting} />},
              {label: 'Monitoring sources', value: 'endoflife.date · provider status feeds'},
              {label: 'Last checked', value: checkedAt ? formatDateTime(checkedAt) : NOT_CHECKED_YET},
            ]}
          />
          <FootNote>
            End-of-support dates come from endoflife.date unless you set one by hand. Incidents come from each provider’s public status page. A provider or service typed as free text is not monitored.
          </FootNote>
        </VStack>
      </PanelCard>

      {app.hosting.length > 0 && (
        <PanelCard title="Active incidents" subtitle="Open provider incidents and announced maintenance that reach this application">
          <IncidentList incidents={incidents} />
        </PanelCard>
      )}

      <HostingDialog
        key={editing?.id ?? String(editing)}
        editing={editing}
        catalog={catalog}
        values={values}
        onChange={setValues}
        onClose={() => setEditing(undefined)}
        onSave={submit}
        isSaving={save.isPending}
        error={save.error}
      />
      {confirm.element}
    </VStack>
  );
}

/** The row's own pill and, when it has no status, why: not monitored, not checked yet, or the check failed. */
function RowStatus({hosting}: {hosting: Hosting}) {
  const reason = hostingStatusReason(hosting);
  return (
    <VStack gap={1} hAlign="start">
      <CheckPill status={hosting.status} />
      {reason && (
        <Text type="supporting" color="secondary">
          {reason}
        </Text>
      )}
    </VStack>
  );
}

/** The date, where it came from, and the prototype's badge when support has ended or ends soon. */
function EndOfSupport({hosting, today}: {hosting: Hosting; today: string}) {
  if (!hosting.endOfSupportOn) {
    return NOT_SET;
  }
  const note = endOfSupportNote(hosting.endOfSupportOn, today);
  const source = hosting.endOfSupportSource === END_OF_SUPPORT_SOURCE.manual ? 'Set by hand' : hosting.endOfSupportSource;
  return (
    <VStack gap={1} hAlign="start">
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text size="sm">{formatDate(hosting.endOfSupportOn)}</Text>
        {note && <Badge label={note.label} variant={note.tone} />}
      </HStack>
      <Text type="supporting" color="secondary">
        {source}
      </Text>
    </VStack>
  );
}

function IncidentList({incidents}: {incidents: IncidentRow[]}) {
  if (incidents.length === 0) {
    return <EmptyState title="No open incidents" description="Nothing on the providers’ status pages reaches this application’s services or regions." isCompact />;
  }
  return (
    <VStack gap={0}>
      {incidents.map((incident, index) => (
        <VStack key={incident.key} gap={0}>
          {index > 0 && <Divider />}
          <HStack gap={3} vAlign="center" hAlign="between" paddingBlock={3}>
            <VStack gap={0.5} style={{flex: 1, minWidth: 0}}>
              {incident.url ? (
                <Link href={incident.url} isExternalLink weight="bold" size="sm">
                  {incident.title}
                </Link>
              ) : (
                <Text weight="bold" size="sm">
                  {incident.title}
                </Text>
              )}
              <Text type="supporting" color="secondary">
                {[incident.affects, incident.startedAt && `since ${formatDateTime(incident.startedAt)}`].filter(Boolean).join(' · ')}
              </Text>
            </VStack>
            <Badge label={incident.kind.label} variant={incident.kind.tone} />
          </HStack>
        </VStack>
      ))}
    </VStack>
  );
}

type DialogProps = {
  editing: Editing;
  catalog: HostingCatalog;
  values: HostingFormValues;
  onChange: (values: HostingFormValues) => void;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  error: string | null;
};

/**
 * Pick a provider, then one of its services (or type either), then only the
 * fields that service has: a version for databases and clusters, a runtime
 * for app services. Free text shows every field.
 */
function HostingDialog({editing, catalog, values, onChange, onClose, onSave, isSaving, error}: DialogProps) {
  const provider = catalog.providers.find((entry) => entry.name === values.provider);
  const service = provider?.services.find((entry) => entry.name === values.service);
  // Free text when the saved value is not in the catalog, or the user picks "Other".
  const [isOtherProvider, setIsOtherProvider] = useState(values.provider !== '' && !provider);
  const [isOtherService, setIsOtherService] = useState(values.service !== '' && !service);
  const isFreeText = isOtherProvider || isOtherService;
  const set = (key: keyof HostingFormValues) => (value: string | null | undefined) => onChange({...values, [key]: value ?? ''});

  function pickProvider(name: string | null) {
    setIsOtherProvider(name === OTHER);
    setIsOtherService(false);
    onChange({...values, provider: name === OTHER || !name ? '' : name, service: ''});
  }

  function pickService(name: string | null) {
    setIsOtherService(name === OTHER);
    const picked = provider?.services.find((entry) => entry.name === name);
    // Drop what the picked service has no field for, so nothing stale is saved unseen.
    onChange({
      ...values,
      service: picked?.name ?? '',
      version: !picked || picked.hasVersion ? values.version : '',
      runtime: !picked || picked.hasRuntime ? values.runtime : '',
      runtimeVersion: !picked || picked.hasRuntime ? values.runtimeVersion : '',
    });
  }

  return (
    <EditDialog
      title={editing ? `Edit ${editing.provider} ${editing.service}` : 'Add hosting'}
      isOpen={editing !== undefined}
      onClose={onClose}
      onSave={onSave}
      isSaving={isSaving}
      error={error}>
      <HStack gap={3} vAlign="start">
        <Selector
          label="Provider"
          options={[...catalog.providers.map((entry) => entry.name), OTHER]}
          value={isOtherProvider ? OTHER : (provider?.name ?? undefined)}
          onChange={pickProvider}
          placeholder="Choose a provider"
          width="100%"
          isRequired
        />
        {provider && (
          <Selector
            label="Service"
            options={[...provider.services.map((entry) => entry.name), OTHER]}
            value={isOtherService ? OTHER : (service?.name ?? undefined)}
            onChange={pickService}
            placeholder="Choose a service"
            hasSearch
            width="100%"
            isRequired
          />
        )}
      </HStack>
      {isOtherProvider && (
        <TextInput label="Provider name" value={values.provider} onChange={set('provider')} placeholder="e.g. Hetzner, on-premises" isRequired />
      )}
      {isFreeText && (
        <TextInput
          label="Service name"
          description="Free text is recorded but not monitored."
          value={values.service}
          onChange={set('service')}
          placeholder="e.g. Virtual server"
          isRequired
        />
      )}
      <HStack gap={3} vAlign="start">
        <TextInput label="Region" value={values.region} onChange={set('region')} placeholder="e.g. centralus" width="100%" isOptional />
        {(isFreeText || service?.hasVersion) && (
          <TextInput
            label="Version"
            description={service?.isEndOfSupportTracked ? 'Used to look up end of support.' : undefined}
            value={values.version}
            onChange={set('version')}
            placeholder="e.g. 16"
            width="100%"
            isOptional
          />
        )}
      </HStack>
      {(isFreeText || service?.hasRuntime) && (
        <HStack gap={3} vAlign="start">
          <Selector
            label="Runtime"
            description="Used to look up end of support."
            options={catalog.runtimes.map((entry) => entry.name)}
            value={values.runtime || null}
            onChange={set('runtime')}
            placeholder="None"
            hasClear
            width="100%"
            isOptional
          />
          <TextInput label="Runtime version" value={values.runtimeVersion} onChange={set('runtimeVersion')} placeholder="e.g. 22" width="100%" isOptional />
        </HStack>
      )}
      <DateInput
        label="End of support (set by hand)"
        description="Leave empty to have it looked up from the version or runtime."
        value={isoDate(values.endOfSupportOn)}
        onChange={set('endOfSupportOn')}
        hasClear
        isOptional
      />
    </EditDialog>
  );
}
