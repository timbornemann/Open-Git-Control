import * as fs from 'node:fs';
import { createHash } from 'node:crypto';

/** Keep large worktree indices off the main thread and out of a single Buffer. */
export async function indexFileHash(file: string): Promise<string | null> {
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Only regular Git index files can be hashed.');
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) return hash.digest('hex');
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
}

export async function copyIndexIfPresent(source: string, destination: string): Promise<fs.Stats | null> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  await fs.promises.copyFile(source, destination);
  return stat;
}

export async function syncIndexFile(file: string): Promise<void> {
  const handle = await fs.promises.open(file, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
