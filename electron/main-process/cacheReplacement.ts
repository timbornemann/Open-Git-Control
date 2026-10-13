import { readStorageJson, readStorageJsonAsync } from './storageSafety';

/** Regenerating a known cache may never overwrite a future or unreadable format. */
export function mayReplaceCache(root: string, file: string, supported: (value: unknown) => boolean): boolean {
  try {
    return supported(readStorageJson(root, file));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}

export async function mayReplaceCacheAsync(root: string, file: string, supported: (value: unknown) => boolean): Promise<boolean> {
  try {
    return supported(await readStorageJsonAsync(root, file));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}
