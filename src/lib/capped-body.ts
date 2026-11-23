/**
 * Reads a request or response body as text, stopping as soon as it is longer
 * than `maxBytes`. Answers null when it is: the rest is never read into memory.
 */
export async function readTextUpTo(
  source: {body: ReadableStream<Uint8Array> | null},
  maxBytes: number,
): Promise<string | null> {
  if (!source.body) {
    return '';
  }
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) {
      return Buffer.concat(chunks).toString();
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}
