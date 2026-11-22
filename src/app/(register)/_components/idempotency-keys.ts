/**
 * One fresh Idempotency-Key per row action, made when the page renders. A
 * double-click or retry of that action sends the same key; the next render
 * (after it succeeds) hands out new ones.
 */
export function keysFor(items: {id: string}[]): Record<string, string> {
  return Object.fromEntries(items.map((item) => [item.id, crypto.randomUUID()]));
}
