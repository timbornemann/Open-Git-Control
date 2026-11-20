import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CompletedRecoveryBackup } from '../../src/shared/ipc/storageMaintenance';
import { writeTextFileAtomicallyAsync } from '../main-process/atomicFile';
import { assertManagedPathAsync, readStorageJsonAsync } from '../main-process/storageSafety';
import { withinDirectory } from './branchBundles';
import { isMissing, readRecoveryFile, recoveryOid, validLocalRef, type BranchRepository } from './branchRecoveryRepository';

export const branchRepairId = /^branch-repair-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const snapshotManifest = 'repair.json';
const metadataDirectory = 'git-metadata';

export async function copyRepairMetadata(source: string, destination: string, signal?: AbortSignal): Promise<void> {
  await fs.cp(source, destination, {
    recursive: true,
    force: false,
    errorOnExist: true,
    mode: constants.COPYFILE_FICLONE,
    filter: async (file) => {
      signal?.throwIfAborted();
      if (path.basename(file).endsWith('.lock')) return false;
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('Git metadata contains a redirected or special file.');
      return true;
    },
  });
}

export async function verifyIsolatableMetadata(repo: BranchRepository): Promise<void> {
  if (!withinDirectory(repo.commonDir, repo.gitDir)) throw new Error('The worktree metadata is outside its common Git directory.');
  if (await readRecoveryFile(repo.commonDir, path.join('objects', 'info', 'alternates'))) {
    throw new Error('Git alternate object directories require a manual recovery.');
  }
}

export class BranchRepairSnapshots {
  private readonly inUse = new Set<string>();

  constructor(private readonly root: string) {}

  async capture(repo: BranchRepository, ref: string, oid: string, signal?: AbortSignal): Promise<{ commonDir: string; release: () => void }> {
    const repoRoot = await fs.realpath(repo.repoPath);
    if (withinDirectory(repoRoot, this.root) || withinDirectory(repo.commonDir, this.root))
      throw new Error('The repair snapshot must be outside the repository.');
    const id = `branch-repair-${randomUUID()}`;
    const directory = path.join(this.root, id);
    await assertManagedPathAsync(this.root, directory);
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    await fs.mkdir(directory, { mode: 0o700 });
    this.inUse.add(id);
    const commonDir = path.join(directory, metadataDirectory);
    try {
      await copyRepairMetadata(repo.commonDir, commonDir, signal);
      await writeTextFileAtomicallyAsync(
        path.join(directory, snapshotManifest),
        JSON.stringify({
          version: 1,
          id,
          repoPath: repo.repoPath,
          repositoryKey: repo.key,
          reference: ref,
          objectId: oid,
          createdAt: Date.now(),
        }),
        this.root,
      );
      return { commonDir, release: () => this.inUse.delete(id) };
    } catch (error) {
      this.inUse.delete(id);
      await this.removeDirectory(directory).catch(() => {});
      throw error;
    }
  }

  async list(): Promise<CompletedRecoveryBackup[]> {
    const directories = await fs.readdir(this.root, { withFileTypes: true }).catch((error: unknown) => {
      if (isMissing(error)) return [];
      throw error;
    });
    const snapshots: CompletedRecoveryBackup[] = [];
    for (const directory of directories) {
      if (!directory.isDirectory() || !branchRepairId.test(directory.name) || this.inUse.has(directory.name)) continue;
      const entry = (await readStorageJsonAsync(this.root, path.join(this.root, directory.name, snapshotManifest), 32_768).catch(() => null)) as
        (CompletedRecoveryBackup & { version: number; repositoryKey: string }) | null;
      if (
        entry?.version === 1 &&
        entry.id === directory.name &&
        typeof entry.repoPath === 'string' &&
        path.isAbsolute(entry.repoPath) &&
        typeof entry.reference === 'string' &&
        validLocalRef(entry.reference) &&
        typeof entry.objectId === 'string' &&
        recoveryOid(entry.objectId) &&
        Number.isFinite(entry.createdAt)
      )
        snapshots.push({ ...entry, kind: 'branch-repair' });
    }
    return snapshots.sort((a, b) => b.createdAt - a.createdAt);
  }

  async remove(repoPath: string, ids: string[]): Promise<number> {
    const known = (await this.list()).filter((entry) => !path.relative(repoPath, entry.repoPath) && ids.includes(entry.id));
    for (const entry of known) await this.removeDirectory(path.join(this.root, entry.id));
    return known.length;
  }

  private async removeDirectory(directory: string) {
    if (!branchRepairId.test(path.basename(directory)) || path.relative(path.dirname(directory), this.root)) throw new Error('Invalid repair snapshot path.');
    const walk = async (current: string): Promise<void> => {
      await assertManagedPathAsync(this.root, current);
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        const file = path.join(current, entry.name);
        await assertManagedPathAsync(this.root, file);
        if (entry.isDirectory()) await walk(file);
        else if (!entry.isFile()) throw new Error('Repair snapshot contains an unexpected entry.');
      }
    };
    await walk(directory);
    await assertManagedPathAsync(this.root, directory);
    await fs.rm(directory, { recursive: true });
  }
}
