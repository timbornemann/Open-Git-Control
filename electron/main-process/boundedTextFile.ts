import * as fs from 'fs';

const openFlags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);
const assertFile = (stat: fs.Stats, maxBytes: number, label: string): void => {
  if (!stat.isFile()) throw new Error(`${label} must be a regular file.`);
  if (stat.size > maxBytes) throw new Error(`${label} is too large.`);
};

/** Read at most limit + 1 bytes, even if the file grows after its initial stat. */
export function readBoundedTextFile(filePath: string, maxBytes: number, label: string): string {
  assertFile(fs.lstatSync(filePath), maxBytes, label);
  const descriptor = fs.openSync(filePath, openFlags);
  try {
    assertFile(fs.fstatSync(descriptor), maxBytes, label);
    const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1));
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maxBytes) {
      const count = fs.readSync(descriptor, buffer, 0, Math.min(buffer.length, maxBytes + 1 - total), total);
      if (!count) break;
      total += count;
      if (total > maxBytes) throw new Error(`${label} is too large.`);
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    return Buffer.concat(chunks, total).toString('utf8');
  } finally {
    fs.closeSync(descriptor);
  }
}

export async function readBoundedTextFileAsync(filePath: string, maxBytes: number, label: string): Promise<string> {
  assertFile(await fs.promises.lstat(filePath), maxBytes, label);
  const descriptor = await fs.promises.open(filePath, openFlags);
  try {
    assertFile(await descriptor.stat(), maxBytes, label);
    const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1));
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maxBytes) {
      const { bytesRead } = await descriptor.read(buffer, 0, Math.min(buffer.length, maxBytes + 1 - total), total);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > maxBytes) throw new Error(`${label} is too large.`);
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    return Buffer.concat(chunks, total).toString('utf8');
  } finally {
    await descriptor.close();
  }
}
