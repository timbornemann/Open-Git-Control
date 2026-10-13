import * as fs from 'node:fs';

const CHUNK_BYTES = 64 * 1024;
const MAX_RECORD_BYTES = 8 * 1024 ** 2;

/** A damaged record without line breaks must not allocate the entire file in memory. */
class JsonlDecoder {
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  feed(chunk: Buffer): string[] {
    const lines: string[] = [];
    let start = 0;
    for (let end = chunk.indexOf(10); end !== -1; end = chunk.indexOf(10, start)) {
      this.append(chunk.subarray(start, end));
      lines.push(this.consume());
      start = end + 1;
    }
    this.append(chunk.subarray(start));
    return lines;
  }
  finish(): string | undefined {
    return this.pendingBytes ? this.consume() : undefined;
  }
  private append(chunk: Buffer): void {
    this.pendingBytes += chunk.length;
    if (this.pendingBytes > MAX_RECORD_BYTES) throw new Error('Unsupported oversized JSONL record.');
    if (chunk.length) this.pending.push(chunk);
  }
  private consume(): string {
    const data = this.pending.length === 1 ? this.pending[0] : Buffer.concat(this.pending, this.pendingBytes);
    const line = data.toString('utf8').replace(/\r$/, '');
    this.pending = [];
    this.pendingBytes = 0;
    return line;
  }
}

export function* readJsonlLines(file: string): Generator<string> {
  const fd = fs.openSync(file, 'r'),
    buffer = Buffer.alloc(CHUNK_BYTES),
    decoder = new JsonlDecoder();
  try {
    let count: number;
    // The descriptor reuses its read buffer; retained fragments must own bytes.
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) yield* decoder.feed(Buffer.from(buffer.subarray(0, count)));
    const last = decoder.finish();
    if (last !== undefined) yield last;
  } finally {
    fs.closeSync(fd);
  }
}

export async function* streamJsonlLines(file: string): AsyncGenerator<string> {
  const input = fs.createReadStream(file, { highWaterMark: CHUNK_BYTES }),
    decoder = new JsonlDecoder();
  try {
    for await (const chunk of input) yield* decoder.feed(chunk as Buffer);
    const last = decoder.finish();
    if (last !== undefined) yield last;
  } finally {
    input.destroy();
  }
}
