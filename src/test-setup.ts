/**
 * Unit tests never use the network. Any test that reaches an outside source
 * must pass or stub a fake `fetch` (see `src/lib/services/test/fake-registry.ts`).
 */
globalThis.fetch = async (input) => {
  throw new Error(`Tests must not use the network: ${String(input)}`);
};
