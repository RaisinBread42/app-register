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
import {MOCK_PEOPLE} from '../_data/seed';

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

export default function MockCreatePage() {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('saas');
  const [ownerId, setOwnerId] = useState('p1');
  const [backupId, setBackupId] = useState('p2');
  const [vendor, setVendor] = useState('');
  const [renewal, setRenewal] = useState('');
  const [notice, setNotice] = useState('');
  const [cost, setCost] = useState('');
  const [billing, setBilling] = useState('annual');
  const [runtime, setRuntime] = useState('');
  const [dataKeys, setDataKeys] = useState('');
  const [whatBreaks, setWhatBreaks] = useState('');

  const isInHouse = kind === 'in_house' || kind === 'citizen_built';

  return (
    <MockShell active="create">
      <VStack gap={5} maxWidth={720}>
        <VStack gap={1}>
          <Heading level={1}>Add app</Heading>
          <Text type="body" color="secondary" display="block">
            One record for something you buy or something your people built.
            Owner and backup are required.
          </Text>
        </VStack>

        <VStack gap={4}>
          <TextInput
            label="App name"
            value={name}
            onChange={setName}
            placeholder="e.g. Harbor CRM"
            isRequired
          />
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
              <TextInput
                label="Vendor"
                value={vendor}
                onChange={setVendor}
                placeholder="Vendor or product company"
              />
              <HStack gap={3} wrap="wrap">
                <TextInput
                  label="Notice deadline"
                  value={notice}
                  onChange={setNotice}
                  placeholder="YYYY-MM-DD"
                  description="Alerts fire 90 / 60 / 30 days before this date"
                  width={220}
                />
                <TextInput
                  label="Renewal date"
                  value={renewal}
                  onChange={setRenewal}
                  placeholder="YYYY-MM-DD"
                  width={220}
                />
              </HStack>
              <HStack gap={3} wrap="wrap">
                <Selector
                  label="Billing cycle"
                  options={[
                    {value: 'monthly', label: 'Monthly'},
                    {value: 'annual', label: 'Annual'},
                    {value: 'other', label: 'Other'},
                  ]}
                  value={billing}
                  onChange={setBilling}
                  width={200}
                  isOptional
                />
                <TextInput
                  label="Cost (USD / period)"
                  value={cost}
                  onChange={setCost}
                  placeholder="4800"
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
                placeholder="VM, cloud project, personal account…"
                isRequired
              />
              <TextArea
                label="Data and keys it touches"
                value={dataKeys}
                onChange={setDataKeys}
                placeholder="APIs, service keys, databases, credentials"
                rows={3}
                isRequired
              />
              <TextArea
                label="What breaks if this stops"
                value={whatBreaks}
                onChange={setWhatBreaks}
                placeholder="Who notices, and what fails"
                rows={3}
                isRequired
              />
            </>
          )}
        </VStack>

        <HStack gap={3}>
          <Button label="Save app" variant="primary" />
          <Button label="Cancel" variant="secondary" href="/mockups/list" />
        </HStack>
      </VStack>
    </MockShell>
  );
}
