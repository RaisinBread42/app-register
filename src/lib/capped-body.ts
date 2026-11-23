type Source = {body: ReadableStream<Uint8Array> | null};

/**
 * Reads a request or response body, stopping as soon as it is longer than
 * `maxBytes`. Answers null when it is: the rest is never read into memory.
 */
export async function readBytesUpTo(source: Source, maxBytes: number): Promise<Uint8Array | null> {
  if (!source.body) {
    return new Uint8Array();
  }
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) {
      return Buffer.concat(chunks);
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}

/** `readBytesUpTo` as UTF-8 text. */
export async function readTextUpTo(source: Source, maxBytes: number): Promise<string | null> {
  const bytes = await readBytesUpTo(source, maxBytes);
  return bytes === null ? null : Buffer.from(bytes).toString();
}
