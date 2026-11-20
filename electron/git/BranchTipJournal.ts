import * as path from 'node:path';
import { writeTextFileAtomicallyAsync } from '../main-process/atomicFile';
import { readStorageJsonAsync } from '../main-process/storageSafety';
import { branchReadOptions, describeBranchRepository, isMissing, recoveryOid, type BranchGitReader, type BranchRepository } from './branchRecoveryRepository';

type Tip = { oid: string; checkedAt: number };

export class BranchTipJournal {
  private readonly writes = new Map<string, Promise<void>>();
  private readonly observed = new Map<string, string>();

  constructor(
    private readonly directory: string,
    private readonly git: BranchGitReader,
  ) {}

  private file(key: string) {
    return path.join(this.directory, `${key}.json`);
  }

  private async read(key: string): Promise<Record<string, Tip>> {
    try {
      const value = await readStorageJsonAsync(this.directory, this.file(key));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved branch tips.');
      return value as Record<string, Tip>;
    } catch (error) {
      if (isMissing(error)) return {};
      throw error;
    }
  }

  async previousTip(repo: BranchRepository, ref: string): Promise<string | undefined> {
    const tip = (await this.read(repo.key))[ref]?.oid;
    return typeof tip === 'string' && recoveryOid(tip, repo.format) ? tip : undefined;
  }

  record(repo: BranchRepository, refs: Record<string, string>, checkedAt: number): Promise<void> {
    const previous = this.writes.get(repo.key);
    const current = (previous ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const tips = await this.read(repo.key);
        let changed = false;
        for (const [ref, oid] of Object.entries(refs)) {
          const prior = tips[ref];
          if (prior?.oid === oid || prior?.checkedAt > checkedAt) continue;
          tips[ref] = { oid, checkedAt };
          changed = true;
        }
        if (changed) await writeTextFileAtomicallyAsync(this.file(repo.key), JSON.stringify(tips), this.directory);
      });
    this.writes.set(repo.key, current);
    const finished = () => {
      if (this.writes.get(repo.key) === current) this.writes.delete(repo.key);
    };
    void current.then(finished, finished);
    return current;
  }

  observe({ repoPath, ref, oid }: { repoPath: string; ref: string; oid: string }) {
    const key = `${repoPath}\0${ref}`;
    if (this.observed.get(key) === oid) return;
    this.observed.set(key, oid);
    const checkedAt = Date.now();
    const options = branchReadOptions({ requestedKind: 'preflight' });
    void (async () => {
      const repo = await describeBranchRepository(this.git, repoPath, options);
      const confirmed = await this.git.runResult(repoPath, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], options);
      if (confirmed.exitCode !== 0 || confirmed.stdout.trim() !== oid || this.observed.get(key) !== oid) throw new Error('Branch tip changed.');
      await this.record(repo, { [ref]: oid }, checkedAt);
    })().catch(() => {
      if (this.observed.get(key) === oid) this.observed.delete(key);
    });
  }
}
