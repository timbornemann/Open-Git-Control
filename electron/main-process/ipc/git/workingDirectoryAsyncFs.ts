import * as fs from 'node:fs';
import * as path from 'node:path';

export const pathKey = (value: string): string => (process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));
export async function pathExists(value: string): Promise<boolean> {
  try {
    await fs.promises.lstat(value);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Linear in the combined path depth, rather than comparing every pair. */
export function assertIndependentPaths(paths: string[]): void {
  const keys = new Set(paths.map(pathKey));
  for (const selected of paths) {
    let parent = path.dirname(selected);
    while (true) {
      if (keys.has(pathKey(parent))) throw new Error('Select either a folder or entries inside it, not both.');
      const next = path.dirname(parent);
      if (next === parent) break;
      parent = next;
    }
  }
}
