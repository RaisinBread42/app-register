'use client';

import {useState} from 'react';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {DateInput} from '@astryxdesign/core/DateInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {HStack} from '@astryxdesign/core/HStack';
import {Table, proportional} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {
  API_KEY_STATUS,
  MONITORING_SOURCE_STATUS,
  type ApiKeyStatus,
  type MonitoringSourceStatus,
} from '@/lib/constants';
import type {ApiKey} from '@/lib/ui/api-client';
import {NOT_SET} from '@/lib/ui/copy';
import {formatDate, formatDateTime} from '@/lib/ui/register-view';
import {createApiKeyAction, revokeApiKeyAction} from '../actions';
import {EditDialog} from '../_components/EditDialog';
import {KeyValueRows, PanelCard} from '../_components/Cards';
import {isoDate} from '../_components/iso-date';
import {useAction} from '../_components/use-action';

const column = (share: number) => proportional(share, {minWidth: 72});

const TONE = {ok: 'green', warn: 'yellow', bad: 'red'} as const;

function titleCase(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

const KEY_STATUS_BADGE: Record<ApiKeyStatus, {label: string; variant: (typeof TONE)[keyof typeof TONE]}> = {
  [API_KEY_STATUS.active]: {label: titleCase(API_KEY_STATUS.active), variant: TONE.ok},
  [API_KEY_STATUS.expired]: {label: titleCase(API_KEY_STATUS.expired), variant: TONE.warn},
  [API_KEY_STATUS.revoked]: {label: titleCase(API_KEY_STATUS.revoked), variant: TONE.bad},
};

const COPY = {
  copyKey: 'Copy key',
  revoke: 'Revoke',
  revokeKey: 'Revoke key',
  createApiKey: 'Create API key',
  createKey: 'Create key',
  noExpiry: 'No expiry',
} as const;

type Props = {
  apiKeys: ApiKey[];
  createKey: string;
  revokeKeys: Record<string, string>;
};

export function ApiKeysSection({apiKeys, createKey, revokeKeys}: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [noExpiry, setNoExpiry] = useState(true);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const create = useAction();
  const revoke = useAction();

  function openCreate() {
    setName('');
    setExpiresOn('');
    setNoExpiry(true);
    setCreatedKey(null);
    create.clearError();
    setIsCreating(true);
  }

  function submitCreate() {
    create.run(
      () =>
        createApiKeyAction(createKey, {
          name,
          expiresOn: noExpiry ? null : expiresOn || null,
        }),
      (result) => {
        if (result.apiKey?.key) {
          setCreatedKey(result.apiKey.key);
        }
        setIsCreating(false);
      },
    );
  }

  async function copyKey() {
    if (createdKey && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(createdKey);
    }
  }

  const revokeTarget = apiKeys.find((key) => key.id === revokeId);

  return (
    <VStack gap={5}>

      {createdKey && (
        <Banner
          status="success"
          title="API key created — copy it now"
          description="This is the only time the full key is shown. Store it in your agent or secret manager."
          isDismissable
          onDismiss={() => setCreatedKey(null)}
          collapsible={false}
          endContent={<Button label={COPY.copyKey} variant="secondary" size="sm" onClick={() => void copyKey()} />}
        >
          <Text weight="bold" style={{fontFamily: 'var(--font-mono, ui-monospace)', wordBreak: 'break-all'}}>
            {createdKey}
          </Text>
        </Banner>
      )}

      <VStack gap={5}>
        <PanelCard
          title="API keys"
          subtitle="Scoped keys so AI agents can read and write the applications register"
          action={<Button label={COPY.createApiKey} variant="primary" size="sm" onClick={openCreate} />}
        >
          {apiKeys.length === 0 ? (
            <EmptyState
              title="No API keys yet"
              description="Create a key with a name and optional expiry for your agents."
              isCompact
            />
          ) : (
            <Table
              data={apiKeys}
              idKey="id"
              hasHover
              columns={[
                {key: 'name', header: 'Name', width: column(1.2)},
                {key: 'keyPrefix', header: 'Prefix', width: column(0.9)},
                {key: 'scopeLabel', header: 'Scope', width: column(1.2)},
                {
                  key: 'createdAt',
                  header: 'Created',
                  width: column(0.9),
                  renderCell: (key: ApiKey) => formatDateTime(key.createdAt),
                },
                {
                  key: 'expiresAt',
                  header: 'Expiry',
                  width: column(0.9),
                  renderCell: (key: ApiKey) =>
                    key.expiresAt ? formatDate(key.expiresAt.slice(0, 10)) : COPY.noExpiry,
                },
                {
                  key: 'lastUsedAt',
                  header: 'Last used',
                  width: column(0.9),
                  renderCell: (key: ApiKey) => (key.lastUsedAt ? formatDateTime(key.lastUsedAt) : NOT_SET),
                },
                {
                  key: 'status',
                  header: 'Status',
                  width: column(0.7),
                  renderCell: (key: ApiKey) => {
                    const badge = KEY_STATUS_BADGE[key.status];
                    return <Badge label={badge.label} variant={badge.variant} />;
                  },
                },
                {
                  key: 'id',
                  header: '',
                  width: column(0.7),
                  renderCell: (key: ApiKey) =>
                    key.status === API_KEY_STATUS.active ? (
                      <Button label={COPY.revoke} variant="ghost" size="sm" onClick={() => setRevokeId(key.id)} />
                    ) : (
                      <Text size="sm" color="secondary">
                        {NOT_SET}
                      </Text>
                    ),
                },
              ]}
            />
          )}
        </PanelCard>
      </VStack>

      <EditDialog
        title={COPY.createApiKey}
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        onSave={submitCreate}
        isSaving={create.isPending}
        error={create.error}
        saveLabel={COPY.createKey}
      >
        <FormLayout defaultOptionality="optional">
          <TextInput
            label="Name"
            description="A short label so you can tell keys apart later."
            value={name}
            onChange={(value) => setName(value ?? '')}
            placeholder="e.g. Coding agent"
            isRequired
          />
          <CheckboxInput
            label="No expiration"
            value={noExpiry}
            onChange={(checked) => {
              setNoExpiry(checked);
              if (checked) setExpiresOn('');
            }}
          />
          {!noExpiry && (
            <DateInput
              label="Expires on"
              description="The key stops working at the end of this day (UTC)."
              value={isoDate(expiresOn)}
              onChange={(value) => setExpiresOn(value ?? '')}
              isRequired
            />
          )}
          <Text type="supporting" color="secondary">
            This key can create, read and update apps, add or import dependencies, and read or update hosting. It
            cannot manage people, alerts, monitoring refresh or other keys.
          </Text>
        </FormLayout>
      </EditDialog>

      <AlertDialog
        isOpen={revokeId !== null}
        onOpenChange={(open) => !open && setRevokeId(null)}
        title="Revoke API key?"
        description={
          revokeTarget
            ? `Revoke “${revokeTarget.name}” (${revokeTarget.keyPrefix}…)? Agents using it will get 401 on the next request. This cannot be undone.`
            : 'Revoke this API key? This cannot be undone.'
        }
        actionLabel={COPY.revokeKey}
        isActionLoading={revoke.isPending}
        onAction={() => {
          if (!revokeId) return;
          revoke.run(() => revokeApiKeyAction(revokeKeys[revokeId] ?? crypto.randomUUID(), revokeId), () =>
            setRevokeId(null),
          );
        }}
      />
    </VStack>
  );
}
