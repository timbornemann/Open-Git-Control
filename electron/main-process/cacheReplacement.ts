import { readStorageJson } from './storageSafety';

/** Regenerating a known cache may never overwrite a future or unreadable format. */
export function mayReplaceCache(root: string, file: string, supported: (value: unknown) => boolean): boolean {
  try {
    return supported(readStorageJson(root, file));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}
