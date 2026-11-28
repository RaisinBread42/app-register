'use client';

import {useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {DateInput} from '@astryxdesign/core/DateInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Table} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';
import type {Person, PersonInput} from '@/lib/ui/api-client';
import {markPersonActiveAction, markPersonLeftAction, savePersonAction} from '../actions';
import {EditDialog} from '../_components/EditDialog';
import {FormError} from '../_components/FormError';
import {PanelCard} from '../_components/Cards';
import {useAction} from '../_components/use-action';
import {isoDate} from '../_components/iso-date';

export type PeopleKeys = {add: string; reactivate: string; edit: Record<string, string>; markLeft: Record<string, string>};

/** `null` adds a new person; `undefined` means the dialog is closed. */
type Editing = Person | null | undefined;

/** Today in the user's own time zone (not UTC), as YYYY-MM-DD. */
const todayIso = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Settings › People: everyone who can own applications. */
export function PeopleSection({people, keys}: {people: Person[]; keys: PeopleKeys}) {
  const [editing, setEditing] = useState<Editing>(undefined);
  const [values, setValues] = useState<PersonInput>({name: '', email: ''});
  const [leaving, setLeaving] = useState<Person | null>(null);
  const [leftOn, setLeftOn] = useState(todayIso());
  const [justLeft, setJustLeft] = useState<Person | null>(null);
  const save = useAction();
  const markLeft = useAction();
  const reactivate = useAction();

  function openEdit(person: Person | null) {
    save.clearError();
    setValues({name: person?.name ?? '', email: person?.email ?? ''});
    setEditing(person);
  }

  function openLeave(person: Person) {
    markLeft.clearError();
    setLeftOn(todayIso());
    setLeaving(person);
  }

  function submitEdit() {
    const key = editing ? keys.edit[editing.id] : keys.add;
    save.run(() => savePersonAction(key, editing?.id ?? null, values), () => setEditing(undefined));
  }

  function submitLeave(person: Person) {
    markLeft.run(
      () => markPersonLeftAction(keys.markLeft[person.id], person.id, leftOn),
      () => {
        setLeaving(null);
        setJustLeft(person);
      },
    );
  }

  return (
    <VStack gap={5}>
      <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
        <Text color="secondary">
          Active people who can own applications. Mark someone as left when they go; their applications keep them until
          reassigned.
        </Text>
        <Button label="+ Add person" variant="primary" onClick={() => openEdit(null)} />
      </HStack>
      {justLeft && (
        <Banner
          status="success"
          title={`${justLeft.name} is marked as left`}
          description="They no longer show here and cannot be picked as a new owner."
          collapsible={false}
          endContent={
            <Button
              label="Back to active"
              variant="secondary"
              size="sm"
              isLoading={reactivate.isPending}
              onClick={() => reactivate.run(() => markPersonActiveAction(keys.reactivate, justLeft.id), () => setJustLeft(null))}
            />
          }
        />
      )}
      <FormError error={reactivate.error} />
      <PanelCard title="Owners and backup owners" subtitle={`${people.length} active ${people.length === 1 ? 'person' : 'people'}`} isFlush>
      <Table
        data={people}
        idKey="id"
        hasHover
        emptyState={<EmptyState title="No people yet" description="Add the people who own and back up your apps." isCompact />}
        columns={[
          {key: 'name', header: 'Name'},
          {key: 'email', header: 'Email'},
          {
            key: 'actions',
            header: '',
            renderCell: (person: Person) => (
              <HStack gap={1} justify="end">
                <Button label="Edit" variant="ghost" size="sm" onClick={() => openEdit(person)} />
                <Button label="Mark as left" variant="ghost" size="sm" onClick={() => openLeave(person)} />
              </HStack>
            ),
          },
        ]}
      />
      </PanelCard>
      <EditDialog
        title={editing ? `Edit ${editing.name}` : 'Add person'}
        isOpen={editing !== undefined}
        onClose={() => setEditing(undefined)}
        onSave={submitEdit}
        isSaving={save.isPending}
        error={save.error}>
        <TextInput label="Name" value={values.name} onChange={(name) => setValues({...values, name})} isRequired />
        <TextInput
          label="Email"
          type="email"
          value={values.email}
          onChange={(email) => setValues({...values, email})}
          isRequired
        />
      </EditDialog>
      <EditDialog
        title={leaving ? `Mark ${leaving.name} as left` : ''}
        isOpen={leaving !== null}
        onClose={() => setLeaving(null)}
        onSave={() => leaving && submitLeave(leaving)}
        isSaving={markLeft.isPending}
        error={markLeft.error}
        saveLabel="Mark as left">
        <Text color="secondary" display="block">
          Apps they own keep them as owner until you reassign them.
        </Text>
        <DateInput label="Left on" value={isoDate(leftOn)} onChange={(value) => setLeftOn(value ?? '')} isRequired />
      </EditDialog>
    </VStack>
  );
}
