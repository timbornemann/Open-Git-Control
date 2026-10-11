import * as fs from 'node:fs';

const CHUNK_BYTES = 64 * 1024;
const MAX_RECORD_BYTES = 8 * 1024 ** 2;

/** A damaged record without line breaks must not allocate the entire file in memory. */
class JsonlDecoder {
  private pending = Buffer.alloc(0);
  feed(chunk: Buffer): string[] {
    const data = Buffer.concat([this.pending, chunk]);
    const lines: string[] = [];
    let start = 0;
    for (let end = data.indexOf(10); end !== -1; end = data.indexOf(10, start)) {
      if (end - start > MAX_RECORD_BYTES) throw new Error('Unsupported oversized JSONL record.');
      lines.push(data.subarray(start, end).toString('utf8').replace(/\r$/, ''));
      start = end + 1;
    }
    this.pending = data.subarray(start);
    if (this.pending.length > MAX_RECORD_BYTES) throw new Error('Unsupported oversized JSONL record.');
    return lines;
  }
  finish(): string | undefined {
    return this.pending.length ? this.pending.toString('utf8').replace(/\r$/, '') : undefined;
  }
}

export function* readJsonlLines(file: string): Generator<string> {
  const fd = fs.openSync(file, 'r'),
    buffer = Buffer.alloc(CHUNK_BYTES),
    decoder = new JsonlDecoder();
  try {
    let count: number;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) yield* decoder.feed(buffer.subarray(0, count));
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
