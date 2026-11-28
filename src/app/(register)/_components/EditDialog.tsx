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
 * then a body that scrolls on its own and holds the fields and any error, then Cancel
 * and the primary action. The header and the buttons never scroll away, whatever the
 * window height or the length of the error. The dialog traps focus and returns it to
 * the opener on close.
 */
export function EditDialog({title, subtitle, isOpen, onClose, onSave, isSaving, error, saveLabel = 'Save', children}: EditDialogProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} purpose="form" width={520} padding={0} maxHeight="85dvh">
      <VStack gap={0} style={{maxHeight: '85dvh'}}>
        <VStack paddingInline={4} paddingBlockStart={4} style={{flex: 'none'}}>
          <DialogHeader title={title} subtitle={subtitle} onOpenChange={(open) => !open && onClose()} />
        </VStack>
        <VStack gap={4} padding={4} style={{flex: '1 1 auto', minHeight: 0, overflowY: 'auto'}}>
          <FormError error={error} />
          {children}
        </VStack>
        <HStack gap={2} justify="end" padding={4} style={{flex: 'none'}}>
          <Button label="Cancel" variant="ghost" onClick={onClose} />
          <Button label={saveLabel} variant="primary" isLoading={isSaving} onClick={onSave} />
        </HStack>
      </VStack>
    </Dialog>
  );
}
