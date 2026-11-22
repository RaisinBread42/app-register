'use client';

import {useState, useTransition} from 'react';
import type {ActionResult} from '@/lib/ui/action-result';

/**
 * Runs one server action for a button or form: `isPending` blocks a second
 * click while it runs, and `error` holds the message to show next to the form.
 */
export function useAction() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T extends ActionResult>(action: () => Promise<T>, onDone?: (result: T) => void) {
    if (isPending) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        onDone?.(result);
      } else {
        setError(result.error);
      }
    });
  }

  return {run, isPending, error, clearError: () => setError(null)};
}
