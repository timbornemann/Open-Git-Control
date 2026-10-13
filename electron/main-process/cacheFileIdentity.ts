import * as fs from 'node:fs';
export const identityFromStat = (stat: fs.Stats): string => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
/** A writer may replace only the exact file it previously validated or created. */
export function cacheFileIdentity(file: string): string | null {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Cache path is not an owned regular file.');
    return identityFromStat(stat);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function cacheFileIdentityAsync(file: string): Promise<string | null> {
  try {
    const stat = await fs.promises.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Cache path is not an owned regular file.');
    return identityFromStat(stat);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
