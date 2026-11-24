'use client';

import {useMemo, useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Selector} from '@astryxdesign/core/Selector';
import {Table} from '@astryxdesign/core/Table';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {MockShell} from '../../_components/MockShell';
import {
  MOCK_ORG,
  MOCK_PEOPLE,
  appsForPerson,
  personOptions,
  type MockLeaverApp,
} from '../../_data/seed';

const LEAVER = MOCK_PEOPLE.find((p) => p.id === 'p1')!;

type RowState = {
  ownerId: string;
  backupId: string;
  done: boolean;
};

/**
 * [05] Leaver flow — step 2: apps they own or back up, with reassign controls.
 * Both owner and backup must stay filled; the leaver cannot remain on either role.
 */
export default function MockLeaverChecklistPage() {
  const rows = useMemo(() => appsForPerson(LEAVER.name), []);
  const [personId, setPersonId] = useState<string>(LEAVER.id);
  const [assignments, setAssignments] = useState<Record<string, RowState>>(
    () =>
      Object.fromEntries(
        rows.map((r) => [
          r.id,
          {
            ownerId: r.suggestedOwnerId,
            backupId: r.suggestedBackupId,
            done: false,
          },
        ]),
      ),
  );

  const remaining = rows.filter((r) => !assignments[r.id]?.done);
  const options = personOptions(personId);

  function setRole(rowId: string, field: 'ownerId' | 'backupId', value: string) {
    setAssignments((prev) => ({
      ...prev,
      [rowId]: {...prev[rowId], [field]: value},
    }));
  }

  function reassign(row: MockLeaverApp) {
    const state = assignments[row.id];
    if (!state.ownerId || !state.backupId) return;
    if (state.ownerId === state.backupId) return;
    setAssignments((prev) => ({
      ...prev,
      [row.id]: {...prev[row.id], done: true},
    }));
  }

  return (
    <MockShell active="leaver">
      <VStack gap={5}>
        <HStack gap={4} vAlign="end" justify="between" wrap="wrap">
          <VStack gap={1}>
            <Heading level={1}>Leaver checklist</Heading>
            <Text type="body" color="secondary" display="block">
              {MOCK_ORG.name} · {remaining.length} app
              {remaining.length === 1 ? '' : 's'} still need a new owner or
              backup
            </Text>
          </VStack>
          <Button
            label="All reassigned view"
            variant="ghost"
            href="/mockups/leaver/done"
          />
        </HStack>

        <Banner
          status="info"
          title="Both roles must stay filled"
          description={`${LEAVER.name} is removed from every app you reassign. Pick a new owner and a different backup — neither field can be empty, and neither can be the leaver.`}
        />

        <Selector
          label="Who is leaving?"
          options={personOptions()}
          value={personId}
          onChange={(v) => setPersonId(v ?? LEAVER.id)}
          hasSearch
          width={360}
          isRequired
        />

        <HStack gap={3} wrap="wrap" vAlign="center">
          <Badge label={`${remaining.length} remaining`} variant="warning" />
          <Badge
            label={`${rows.length - remaining.length} reassigned`}
            variant="success"
          />
          <Text type="supporting" color="secondary">
            Role today · counterpart stays until you save
          </Text>
        </HStack>

        <Table
          data={remaining}
          idKey="id"
          hasHover
          density="compact"
          dividers="rows"
          columns={[
            {
              key: 'appName',
              header: 'App',
              renderCell: (row: MockLeaverApp) => (
                <VStack gap={0}>
                  <Text type="body" weight="medium">
                    {row.appName}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {row.kindLabel}
                  </Text>
                </VStack>
              ),
            },
            {
              key: 'role',
              header: 'Their role',
              renderCell: (row: MockLeaverApp) => (
                <Badge
                  label={row.roleLabel}
                  variant={row.role === 'owner' ? 'info' : 'neutral'}
                />
              ),
            },
            {
              key: 'other',
              header: 'Other role today',
              renderCell: (row: MockLeaverApp) => (
                <VStack gap={0}>
                  <Text type="supporting" color="secondary">
                    {row.otherRoleLabel}
                  </Text>
                  <Text type="body">{row.otherPersonName}</Text>
                </VStack>
              ),
            },
            {
              key: 'newOwner',
              header: 'New owner',
              renderCell: (row: MockLeaverApp) => (
                <Selector
                  label="New owner"
                  isLabelHidden
                  options={options}
                  value={assignments[row.id]?.ownerId ?? null}
                  onChange={(v) => {
                    if (v) setRole(row.id, 'ownerId', v);
                  }}
                  width={200}
                  size="sm"
                  isRequired
                />
              ),
            },
            {
              key: 'newBackup',
              header: 'New backup',
              renderCell: (row: MockLeaverApp) => (
                <Selector
                  label="New backup"
                  isLabelHidden
                  options={options}
                  value={assignments[row.id]?.backupId ?? null}
                  onChange={(v) => {
                    if (v) setRole(row.id, 'backupId', v);
                  }}
                  width={200}
                  size="sm"
                  isRequired
                />
              ),
            },
            {
              key: 'action',
              header: '',
              renderCell: (row: MockLeaverApp) => {
                const state = assignments[row.id];
                const samePerson =
                  state?.ownerId && state.ownerId === state.backupId;
                return (
                  <Button
                    label="Reassign"
                    variant="primary"
                    size="sm"
                    isDisabled={!state?.ownerId || !state?.backupId || samePerson}
                    onClick={() => reassign(row)}
                  />
                );
              },
            },
          ]}
        />

        {remaining.length === 0 && (
          <Banner
            status="success"
            title="Checklist clear"
            description={`Every app ${LEAVER.name} owned or backed up has a new owner and backup.`}
            endContent={
              <Button
                label="View empty state"
                variant="secondary"
                size="sm"
                href="/mockups/leaver/done"
              />
            }
          />
        )}
      </VStack>
    </MockShell>
  );
}
