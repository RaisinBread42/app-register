'use client';

import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {FormError} from './FormError';

type EditDialogProps = {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  error: string | null;
  saveLabel?: string;
  children: React.ReactNode;
};

/**
 * Every form dialog's one layout ([30]): the title with a close control at the top,
 * the fields in a body that scrolls on its own (so a long form keeps its title and its
 * buttons in view), the API's error, then Cancel and the primary action. The dialog
 * traps focus and returns it to the opener on close.
 */
export function EditDialog({title, subtitle, isOpen, onClose, onSave, isSaving, error, saveLabel = 'Save', children}: EditDialogProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} purpose="form" width={520} padding={4} maxHeight="85dvh">
      <VStack gap={4}>
        <DialogHeader title={title} subtitle={subtitle} onOpenChange={(open) => !open && onClose()} />
        <VStack gap={4} paddingInline={0.5} style={{maxHeight: 'calc(85dvh - var(--spacing-10) * 4)', overflowY: 'auto'}}>
          {children}
        </VStack>
        <FormError error={error} />
        <HStack gap={2} justify="end">
          <Button label="Cancel" variant="ghost" onClick={onClose} />
          <Button label={saveLabel} variant="primary" isLoading={isSaving} onClick={onSave} />
        </HStack>
      </VStack>
    </Dialog>
  );
}
