'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Selector} from '@astryxdesign/core/Selector';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import {MockShell} from '../_components/MockShell';

const KIND_OPTIONS = [
  {value: 'saas', label: 'SaaS (bought)'},
  {value: 'in_house', label: 'In-house'},
  {value: 'citizen_built', label: 'Citizen-built'},
  {value: 'vendor_service', label: 'Vendor service'},
];

const PERSON_OPTIONS = [
  {value: 'p1', label: 'Priya Chen', description: 'priya.chen@meridian.demo'},
  {value: 'p2', label: 'Marcus Okonkwo', description: 'marcus.o@meridian.demo'},
  {value: 'p3', label: 'Elena Vogt', description: 'elena.v@meridian.demo'},
  {value: 'p4', label: 'Jamal Reyes', description: 'jamal.r@meridian.demo'},
];

export default function MockCreatePage() {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('saas');
  const [ownerId, setOwnerId] = useState('p1');
  const [backupId, setBackupId] = useState('p2');
  const [vendor, setVendor] = useState('');
  const [renewal, setRenewal] = useState('');
  const [notice, setNotice] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <MockShell active="apps">
      <VStack gap={5} maxWidth={640}>
        <VStack gap={1}>
          <Heading level={1}>Add app</Heading>
          <Text type="body" color="secondary" display="block">
            Capture identity, ownership and licence basics. Dependencies and
            hosting can be linked after create (mockup).
          </Text>
        </VStack>

        <TextInput
          label="App name"
          value={name}
          onChange={setName}
          placeholder="e.g. Atlas Board"
          isRequired
        />
        <Selector
          label="Kind"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(v) => setKind(v ?? 'saas')}
        />
        <Selector
          label="Owner"
          options={PERSON_OPTIONS}
          value={ownerId}
          onChange={(v) => setOwnerId(v ?? 'p1')}
        />
        <Selector
          label="Backup owner"
          options={PERSON_OPTIONS}
          value={backupId}
          onChange={(v) => setBackupId(v ?? 'p2')}
        />
        <TextInput
          label="Vendor (if licensed)"
          value={vendor}
          onChange={setVendor}
          placeholder="Optional"
        />
        <HStack gap={3} wrap="wrap">
          <TextInput
            label="Notice deadline"
            value={notice}
            onChange={setNotice}
            placeholder="YYYY-MM-DD"
          />
          <TextInput
            label="Renewal date"
            value={renewal}
            onChange={setRenewal}
            placeholder="YYYY-MM-DD"
          />
          <TextInput
            label="Annual cost"
            value={cost}
            onChange={setCost}
            placeholder="$0"
          />
        </HStack>
        <TextArea
          label="Notes"
          value={notes}
          onChange={setNotes}
          placeholder="Optional context"
        />

        <HStack gap={2}>
          <Button label="Save app" variant="primary" />
          <Button label="Cancel" variant="ghost" href="/mockups/list" />
        </HStack>
      </VStack>
    </MockShell>
  );
}
