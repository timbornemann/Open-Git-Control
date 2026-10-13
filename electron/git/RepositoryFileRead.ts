import * as fs from 'node:fs';

const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);

/** Bounded asynchronous reads, even when a file grows after opening it. */
export async function readRepositoryFileBytes(filePath: string, maxBytes: number, truncate = false): Promise<{ data: Buffer; stat: fs.Stats }> {
  const handle = await fs.promises.open(filePath, flags);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('Only regular files can be read.');
    if (!truncate && stat.size > maxBytes) throw new Error('File is too large.');
    const limit = maxBytes + (truncate ? 0 : 1);
    const buffer = Buffer.alloc(Math.min(limit, 64 * 1024));
    const chunks: Buffer[] = [];
    let total = 0;
    while (total < limit) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, limit - total), total);
      if (!bytesRead) break;
      total += bytesRead;
      if (!truncate && total > maxBytes) throw new Error('File is too large.');
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    return { data: Buffer.concat(chunks, total), stat };
  } finally {
    await handle.close();
  }
}
