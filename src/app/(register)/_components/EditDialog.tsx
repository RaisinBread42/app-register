'use client';

import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {FormError} from './FormError';

type EditDialogProps = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  error: string | null;
  saveLabel?: string;
  children: React.ReactNode;
};

/** A small form in a dialog: fields, the API's error next to them, Save and Cancel. */
export function EditDialog({title, isOpen, onClose, onSave, isSaving, error, saveLabel = 'Save', children}: EditDialogProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} purpose="form" width={520} padding={4}>
      <VStack gap={4}>
        <DialogHeader title={title} onOpenChange={(open) => !open && onClose()} />
        {children}
        <FormError error={error} />
        <HStack gap={2} justify="end">
          <Button label="Cancel" variant="ghost" onClick={onClose} />
          <Button label={saveLabel} variant="primary" isLoading={isSaving} onClick={onSave} />
        </HStack>
      </VStack>
    </Dialog>
  );
}
