import * as fs from 'node:fs';
import * as path from 'node:path';
import { readRepositoryFileBytes } from '../git/RepositoryFileRead';

/** Do not follow a redirected managed root, ancestor or entry, even for inventory. */
export function assertManagedPath(root: string, file: string): void {
  const relative = path.relative(root, file);
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new Error('Storage path is outside its managed root.');
  let current = path.resolve(root);
  const paths = [current];
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    paths.push(current);
  }
  for (const candidate of paths) {
    try {
      if (fs.lstatSync(candidate).isSymbolicLink()) throw new Error('Redirected storage paths are protected.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
export function readStorageJson(root: string, file: string): unknown {
  assertManagedPath(root, file);
  if (fs.statSync(file).size > 16 * 1024 ** 2) throw new Error('Storage metadata exceeds its read limit.');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
}

export async function assertManagedPathAsync(root: string, file: string): Promise<void> {
  const relative = path.relative(root, file);
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) throw new Error('Storage path is outside its managed root.');
  let current = path.resolve(root);
  for (const segment of ['', ...relative.split(path.sep).filter(Boolean)]) {
    current = path.join(current, segment);
    try {
      if ((await fs.promises.lstat(current)).isSymbolicLink()) throw new Error('Redirected storage paths are protected.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export async function readStorageJsonAsync(root: string, file: string, maxBytes = 16 * 1024 ** 2): Promise<unknown> {
  await assertManagedPathAsync(root, file);
  return JSON.parse((await readRepositoryFileBytes(file, maxBytes)).data.toString('utf8')) as unknown;
}
