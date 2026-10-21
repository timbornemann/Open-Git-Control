import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { repositoryCommonDirectory, physicalPathKey } from '../git/RepositoryCommonDirectory';
import { readStorageJsonAsync, assertManagedPathAsync } from './storageSafety';
import { writeTextFileAtomicallyAsync } from './atomicFile';
import { canPersistAuxiliary, serializeAuxiliaryWrite } from './auxiliaryDiskBudget';
import { recordCacheUse } from './managedStorage';
import { workDigest } from './PlannerWorkStore';

export class PlannerWorkCache {
  constructor(private readonly root: string) {}
  private file(repo: string, key: string, recovery = false) {
    const common = repositoryCommonDirectory(repo);
    if (!common) throw new Error('Repository common directory is unavailable.');
    return path.join(this.root, 'planner-work-v1', `${recovery ? 'recovery-' : ''}${workDigest([physicalPathKey(common), key])}.json`);
  }
  async read<T>(repo: string, key: string, recovery = false): Promise<T | undefined> {
    const file = this.file(repo, key, recovery);
    try {
      const record = (await readStorageJsonAsync(this.root, file, 2 * 1024 ** 2)) as { version: number; value: T };
      if (record?.version !== 1 || !record.value || typeof record.value !== 'object') throw new Error('Unsupported planner work cache.');
      recordCacheUse(file);
      return record.value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  async write<T>(repo: string, key: string, value: T, current: () => boolean, recovery = false) {
    const file = this.file(repo, key, recovery);
    const text = JSON.stringify({ version: 1, value });
    if (Buffer.byteLength(text) > 2 * 1024 ** 2) throw new Error('Planner work cache is too large.');
    await serializeAuxiliaryWrite(this.root, async () => {
      await assertManagedPathAsync(this.root, file);
      await fs.mkdir(path.dirname(file), { recursive: true });
      if (!(await canPersistAuxiliary(this.root, file, Buffer.byteLength(text)))) throw new Error('Planner work cache budget exceeded.');
      await writeTextFileAtomicallyAsync(file, text, this.root, async () => current());
      recordCacheUse(file);
    });
  }
  async removeRecovery(repo: string, key: string) {
    const file = this.file(repo, key, true);
    await assertManagedPathAsync(this.root, file);
    await fs.unlink(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
