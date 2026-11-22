'use client';

import {Suspense, useMemo, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Selector} from '@astryxdesign/core/Selector';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {MockShell} from '../_components/MockShell';
import {
  MOCK_APPS,
  MOCK_PEOPLE,
  statusBadgeVariant,
} from '../_data/seed';

const KIND_OPTIONS = [
  {value: 'saas', label: 'SaaS (bought)'},
  {value: 'in_house', label: 'In-house'},
  {value: 'citizen_built', label: 'Citizen-built'},
  {value: 'vendor_service', label: 'Vendor service'},
];

const PERSON_OPTIONS = MOCK_PEOPLE.map((p) => ({
  value: p.id,
  label: p.name,
  description: p.email,
}));

function personIdByName(name: string): string | null {
  return MOCK_PEOPLE.find((p) => p.name === name)?.id ?? null;
}

function EditForm() {
  const params = useSearchParams();
  const id = params.get('id') ?? 'a1';
  const seed = useMemo(
    () => MOCK_APPS.find((a) => a.id === id) ?? MOCK_APPS[0],
    [id],
  );

  const [name, setName] = useState(seed.name);
  const [kind, setKind] = useState<string>(seed.kind);
  const [ownerId, setOwnerId] = useState(personIdByName(seed.owner) ?? 'p1');
  const [backupId, setBackupId] = useState(
    personIdByName(seed.backupOwner) ?? 'p2',
  );
  const [vendor, setVendor] = useState(
    seed.kind === 'saas' || seed.kind === 'vendor_service'
      ? seed.vendorOrRuntime
      : '',
  );
  const [renewal, setRenewal] = useState(
    seed.renewalDate === '—' ? '' : seed.renewalDate,
  );
  const [notice, setNotice] = useState(
    seed.noticeDeadline === '—' ? '' : seed.noticeDeadline,
  );
  const [cost, setCost] = useState(
    seed.costLabel === '—' ? '' : seed.costLabel.replace(/[^0-9]/g, ''),
  );
  const [runtime, setRuntime] = useState(seed.runtimeLocation ?? '');
  const [dataKeys, setDataKeys] = useState(seed.dataAndKeys ?? '');
  const [whatBreaks, setWhatBreaks] = useState(seed.whatBreaksIfStopped ?? '');

  const isInHouse = kind === 'in_house' || kind === 'citizen_built';

  return (
    <VStack gap={5} maxWidth={720}>
      <HStack gap={3} vAlign="center" justify="between" wrap="wrap">
        <VStack gap={1}>
          <Heading level={1}>{seed.name}</Heading>
          <Text type="body" color="secondary" display="block">
            Edit ownership, dates, and in-house risk notes.
          </Text>
        </VStack>
        <Badge
          label={seed.statusLabel}
          variant={statusBadgeVariant(seed.status)}
        />
      </HStack>

      <VStack gap={4}>
        <TextInput label="App name" value={name} onChange={setName} isRequired />
        <Selector
          label="Kind"
          options={KIND_OPTIONS}
          value={kind}
          onChange={setKind}
          isRequired
        />
        <HStack gap={3} wrap="wrap">
          <Selector
            label="Owner"
            options={PERSON_OPTIONS}
            value={ownerId}
            onChange={setOwnerId}
            isRequired
            width={280}
          />
          <Selector
            label="Backup owner"
            options={PERSON_OPTIONS}
            value={backupId}
            onChange={setBackupId}
            isRequired
            width={280}
          />
        </HStack>

        {!isInHouse ? (
          <>
            <TextInput label="Vendor" value={vendor} onChange={setVendor} />
            <HStack gap={3} wrap="wrap">
              <TextInput
                label="Notice deadline"
                value={notice}
                onChange={setNotice}
                placeholder="YYYY-MM-DD"
                description="Not the renewal date — this is what alerts use"
                width={220}
              />
              <TextInput
                label="Renewal date"
                value={renewal}
                onChange={setRenewal}
                placeholder="YYYY-MM-DD"
                width={220}
              />
              <TextInput
                label="Cost (USD / period)"
                value={cost}
                onChange={setCost}
                width={200}
                isOptional
              />
            </HStack>
          </>
        ) : (
          <>
            <TextInput
              label="Where it runs"
              value={runtime}
              onChange={setRuntime}
              isRequired
            />
            <TextArea
              label="Data and keys it touches"
              value={dataKeys}
              onChange={setDataKeys}
              rows={3}
              isRequired
            />
            <TextArea
              label="What breaks if this stops"
              value={whatBreaks}
              onChange={setWhatBreaks}
              rows={3}
              isRequired
            />
          </>
        )}
      </VStack>

      <HStack gap={3}>
        <Button label="Save changes" variant="primary" />
        <Button label="Back to list" variant="secondary" href="/mockups/list" />
      </HStack>
    </VStack>
  );
}

export default function MockEditPage() {
  return (
    <MockShell active="edit">
      <Suspense fallback={<Text type="body">Loading…</Text>}>
        <EditForm />
      </Suspense>
    </MockShell>
  );
}
