/** The event an AbortSignal fires when it aborts. */
const ABORT_EVENT = 'abort';

type Source = {body: ReadableStream<Uint8Array> | null};

/**
 * Reads a request or response body, stopping as soon as it is longer than
 * `maxBytes`. Answers null when it is: the rest is never read into memory.
 *
 * With a `signal`, every read is raced against it: when it aborts the read stops
 * and this rejects with the signal's reason, however slowly the body arrives.
 * (The signal given to `fetch` does not reliably stop a body that is already
 * streaming, so a sender that drips one byte at a time would never be cut off.)
 */
export async function readBytesUpTo(source: Source, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  if (!source.body) {
    return new Uint8Array();
  }
  const reader = source.body.getReader();
  const stop = stopWhenAborted(signal);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await Promise.race([reader.read(), stop.aborted]);
      if (done) {
        return Buffer.concat(chunks);
      }
      size += value.byteLength;
      if (size > maxBytes) {
        return null;
      }
      chunks.push(value);
    }
  } finally {
    stop.forget();
    // Stops the sender on every early exit (too long, aborted, failed); a no-op once the body has ended.
    void reader.cancel().catch(() => undefined);
  }
}

/** `readBytesUpTo` as UTF-8 text. */
export async function readTextUpTo(source: Source, maxBytes: number, signal?: AbortSignal): Promise<string | null> {
  const bytes = await readBytesUpTo(source, maxBytes, signal);
  return bytes === null ? null : Buffer.from(bytes).toString();
}

/** A promise that rejects with the signal's reason when it aborts; without a signal it never settles. */
function stopWhenAborted(signal?: AbortSignal): {aborted: Promise<never>; forget: () => void} {
  let onAbort = (): void => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal?.reason);
    if (signal?.aborted) {
      onAbort();
    }
    signal?.addEventListener(ABORT_EVENT, onAbort, {once: true});
  });
  // The race above handles the rejection; this keeps it from being reported as unhandled once nothing is racing.
  aborted.catch(() => undefined);
  return {aborted, forget: () => signal?.removeEventListener(ABORT_EVENT, onAbort)};
}
