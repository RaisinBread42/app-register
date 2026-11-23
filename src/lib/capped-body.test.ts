import {describe, expect, it} from 'vitest';
import {readBytesUpTo, readTextUpTo} from './capped-body';
import {createFetchText} from './monitoring/http';
import {createPackageSources} from './services/package-sources';

const BUDGET_MS = 40;
/** Far longer than any budget below, far shorter than the 8 s per-call timeout. */
const MUCH_LATER_MS = 1_500;

/** A body that sends one byte and then nothing, for ever; `isCancelled` says whether the reader told the sender to stop. */
function endlessBody() {
  const state = {isCancelled: false};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('['));
    },
    cancel() {
      state.isCancelled = true;
    },
  });
  return {body, state};
}

/** A body that keeps dripping one byte every few milliseconds and never ends. */
function drippingBody() {
  const state = {isCancelled: false};
  let drip: ReturnType<typeof setInterval>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      drip = setInterval(() => controller.enqueue(new TextEncoder().encode(' ')), 5);
    },
    cancel() {
      clearInterval(drip);
      state.isCancelled = true;
    },
  });
  return {body, state};
}

async function timed<T>(run: () => Promise<T>): Promise<{error: unknown; ms: number}> {
  const start = performance.now();
  const error = await run().then(
    () => null,
    (caught: unknown) => caught,
  );
  return {error, ms: performance.now() - start};
}

describe('capped body reader', () => {
  it('a body is read whole up to the cap, and one byte over the cap is null with the sender told to stop', async () => {
    expect(await readTextUpTo(new Response('hello'), 5)).toBe('hello');
    expect(await readTextUpTo(new Response('hello'), 5, AbortSignal.timeout(MUCH_LATER_MS))).toBe('hello');
    expect(await readBytesUpTo({body: null}, 5)).toEqual(new Uint8Array());

    const {body, state} = drippingBody();
    expect(await readBytesUpTo({body}, 3)).toBeNull();
    expect(state.isCancelled).toBe(true);
  });

  it('a body that never ends is stopped when the signal aborts: the read rejects with the signal’s reason and the sender is told to stop', async () => {
    for (const source of [endlessBody(), drippingBody()]) {
      const {error, ms} = await timed(() => readBytesUpTo(source, 1_000_000, AbortSignal.timeout(BUDGET_MS)));
      expect((error as Error).name).toBe('TimeoutError');
      expect(ms).toBeLessThan(MUCH_LATER_MS);
      expect(source.state.isCancelled).toBe(true);
    }
  });

  it('a signal that has already aborted stops the read before the first byte', async () => {
    const source = endlessBody();
    const {error} = await timed(() => readBytesUpTo(source, 1_000_000, AbortSignal.abort(new Error('out of time'))));
    expect((error as Error).message).toBe('out of time');
    expect(source.state.isCancelled).toBe(true);
  });

  it('a hosting feed that answers 200 and then drips its body is cut off when the caller’s budget runs out', async () => {
    const source = drippingBody();
    // Like Node 22's fetch after the headers have arrived: the signal given to fetch does not stop the body.
    const fetchText = createFetchText(async () => new Response(source.body));
    const {error, ms} = await timed(() => fetchText('https://status.example.test/feed', AbortSignal.timeout(BUDGET_MS)));
    expect((error as Error).name).toBe('TimeoutError');
    expect(ms).toBeLessThan(MUCH_LATER_MS);
    expect(source.state.isCancelled).toBe(true);
  });

  it('a package registry that answers 200 and then drips its body is cut off the same way', async () => {
    const source = drippingBody();
    const sources = createPackageSources(async () => new Response(source.body));
    const {error, ms} = await timed(() => sources.latestVersion('left-pad', AbortSignal.timeout(BUDGET_MS)));
    expect((error as Error).name).toBe('TimeoutError');
    expect(ms).toBeLessThan(MUCH_LATER_MS);
    expect(source.state.isCancelled).toBe(true);
  });
});
