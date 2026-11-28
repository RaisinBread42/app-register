'use client';

import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';
import type {UndoTarget} from '@/lib/ui/api-client';
import {undoMatchAction} from '../actions';

/** One Idempotency-Key per match per action, rendered with the page. */
export type MatchKeys = {status: Record<string, string>; assign: Record<string, string>; undo: Record<string, string>};

/**
 * Confirms a notice action with a toast whose Undo reverses only that action. When a
 * later change has happened since, or the server refuses for another reason, a second
 * toast says why instead of failing silently.
 */
export function useConfirmWithUndo(keys: MatchKeys) {
  const showToast = useToast();
  return (body: string, matchId: string, target: UndoTarget) => {
    const undo = async () => {
      const result = await undoMatchAction(keys.undo[matchId], matchId, target);
      showToast(result.ok ? {body: 'Undone'} : {body: `Could not undo: ${result.error}`, type: 'error'});
    };
    showToast({body, endContent: <Button label="Undo" size="sm" variant="secondary" onClick={() => void undo()} />});
  };
}
