import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BranchBackupOverview, BranchBackupStatus } from '../../src/shared/ipc/branchRecovery';
import { writeTextFileAtomicallyAsync } from '../main-process/atomicFile';
import { readStorageJsonAsync } from '../main-process/storageSafety';
import { BranchBundleStore, readBranchTips, sameBranchTips, withinDirectory, type BranchBundle } from './branchBundles';
import { branchReadOptions, describeBranchRepository, isMissing, type BranchRepository } from './branchRecoveryRepository';
import type { BranchTipJournal } from './BranchTipJournal';
import type { GitRunner } from './GitRunner';
import type { RepositoryHeadService } from './RepositoryHeadService';

const intervalMs = 15 * 60_000;
type Preferences = { enabled: boolean; directory: string | null };
const emptyPreferences: Preferences = { enabled: false, directory: null };

export class BranchBackupService {
  private preferences = emptyPreferences;
  private readonly statuses = new Map<string, BranchBackupStatus>();
  private readonly due = new Map<string, number>();
  private readonly verifiedTimes = new Map<string, number>();
  private ticking?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private controller = new AbortController();
  private disposed = false;
  private readonly ready: Promise<void>;
  private changing = Promise.resolve();
  readonly bundles: BranchBundleStore;

  constructor(
    private readonly profile: string,
    private readonly git: GitRunner,
    private readonly heads: RepositoryHeadService,
    private readonly tips: BranchTipJournal,
    private readonly openRepositories: () => string[],
  ) {
    this.bundles = new BranchBundleStore(git);
    this.ready = this.loadPreferences();
    void this.ready.then(() => this.repositoriesChanged());
  }

  private async loadPreferences() {
    const file = path.join(this.profile, 'branch-backups.json');
    try {
      const value = (await readStorageJsonAsync(this.profile, file, 32_768)) as Partial<Preferences> | null;
      if (value && typeof value.directory === 'string' && path.isAbsolute(value.directory)) {
        this.preferences = { directory: value.directory, enabled: value.enabled === true };
        await this.loadVerificationTimes(value.directory);
      }
    } catch (error) {
      if (!isMissing(error)) console.warn('[branch-backups] Could not read backup preferences.');
    }
  }

  private async loadVerificationTimes(directory: string) {
    const stored = (await readStorageJsonAsync(this.profile, path.join(this.profile, 'branch-backup-times.json')).catch(() => null)) as {
      directory?: string;
      times?: Record<string, number>;
    } | null;
    if (stored?.directory !== directory || !stored.times || typeof stored.times !== 'object') return;
    for (const [key, timestamp] of Object.entries(stored.times)) {
      if (/^[0-9a-f]{64}$/.test(key) && Number.isSafeInteger(timestamp) && timestamp > 0) this.verifiedTimes.set(key, timestamp);
    }
  }

  private async rememberVerification(directory: string, key: string, verifiedAt: number | null) {
    if ((this.verifiedTimes.get(key) ?? null) === verifiedAt) return;
    if (verifiedAt === null) this.verifiedTimes.delete(key);
    else this.verifiedTimes.set(key, verifiedAt);
    const contents = JSON.stringify({ directory, times: Object.fromEntries(this.verifiedTimes) });
    await writeTextFileAtomicallyAsync(path.join(this.profile, 'branch-backup-times.json'), contents, this.profile).catch(() => {
      console.warn('[branch-backups] Could not save verification times.');
    });
  }

  async overview(): Promise<BranchBackupOverview> {
    await this.ready;
    return {
      ...this.preferences,
      repositories: this.openRepositories().map((repoPath) => this.statuses.get(repoPath) ?? { repoPath, checkedAt: null, verifiedAt: null, lastError: null }),
    };
  }

  async versions(repo: BranchRepository): Promise<BranchBundle[]> {
    await this.ready;
    return this.preferences.directory ? this.bundles.versions(this.preferences.directory, repo) : [];
  }

  async chooseDirectory(directory: string): Promise<BranchBackupOverview> {
    await this.ready;
    const canonical = await fs.realpath(directory);
    if (!(await fs.stat(canonical)).isDirectory()) throw new Error('Choose a backup directory.');
    for (const repo of this.openRepositories()) {
      const real = await fs.realpath(repo).catch(() => path.resolve(repo));
      if (withinDirectory(real, canonical)) throw new Error('The backup directory must be outside the open repositories.');
    }
    const insideGit = await this.git.runResult(canonical, ['rev-parse', '--git-dir'], branchReadOptions()).catch(() => null);
    if (insideGit?.exitCode === 0) throw new Error('Choose a directory outside Git repositories.');
    return this.change((current) => ({ ...current, directory: canonical }));
  }

  async enable(enabled: boolean): Promise<BranchBackupOverview> {
    await this.ready;
    return this.change((current) => {
      if (enabled && !current.directory) throw new Error('Choose a backup directory first.');
      return { ...current, enabled };
    });
  }

  private async change(update: (value: Preferences) => Preferences): Promise<BranchBackupOverview> {
    const pending = this.changing.then(async () => {
      const previous = this.preferences;
      const next = update(previous);
      await writeTextFileAtomicallyAsync(path.join(this.profile, 'branch-backups.json'), JSON.stringify(next), this.profile);
      this.controller.abort();
      await this.ticking;
      this.controller = new AbortController();
      this.preferences = next;
      this.due.clear();
      if (next.directory !== previous.directory) {
        this.statuses.clear();
        this.verifiedTimes.clear();
        if (next.directory) await this.loadVerificationTimes(next.directory);
      }
      this.repositoriesChanged();
    });
    this.changing = pending.catch(() => {});
    await pending;
    return this.overview();
  }

  repositoriesChanged() {
    if (this.disposed || !this.preferences.enabled || !this.preferences.directory) return;
    clearTimeout(this.timer);
    for (const repo of this.due.keys()) {
      if (!this.openRepositories().includes(repo)) {
        this.due.delete(repo);
        this.statuses.delete(repo);
      }
    }
    this.timer = setTimeout(() => this.startTick(), 0);
    this.timer.unref();
  }

  private startTick() {
    const { enabled, directory } = this.preferences;
    if (this.disposed || !enabled || !directory || this.ticking) return;
    const signal = this.controller.signal;
    this.ticking = this.checkOpenRepositories(directory, signal)
      .catch(() => {})
      .finally(() => {
        this.ticking = undefined;
        if (this.disposed || signal.aborted) return;
        const next = this.openRepositories().reduce((dueAt, repo) => Math.min(dueAt, this.due.get(repo) ?? Date.now()), Date.now() + intervalMs);
        this.timer = setTimeout(() => this.startTick(), Math.max(1000, next - Date.now()));
        this.timer.unref();
      });
  }

  private async checkOpenRepositories(directory: string, signal: AbortSignal) {
    const seen = new Map<string, BranchBackupStatus>();
    for (const repoPath of this.openRepositories()) {
      signal.throwIfAborted();
      if (!this.openRepositories().includes(repoPath) || (this.due.get(repoPath) ?? 0) > Date.now()) continue;
      const checkedAt = Date.now();
      this.due.set(repoPath, checkedAt + intervalMs);
      const status: BranchBackupStatus = { repoPath, checkedAt, verifiedAt: this.statuses.get(repoPath)?.verifiedAt ?? null, lastError: null };
      try {
        const repo = await describeBranchRepository(this.git, repoPath, { signal, requestedKind: 'preflight' });
        status.verifiedAt = this.verifiedTimes.get(repo.key) ?? null;
        const alreadySeen = seen.get(repo.key);
        if (alreadySeen) {
          this.statuses.set(repoPath, { ...alreadySeen, repoPath });
          continue;
        }
        seen.set(repo.key, status);
        const versions = await this.bundles.versions(directory, repo);
        status.verifiedAt = versions[0]?.verifiedAt ?? null;
        await this.rememberVerification(directory, repo.key, status.verifiedAt);
        await this.heads.read(repoPath, { signal, requestedKind: 'preflight' });
        const refs = await readBranchTips(this.git, repo, signal);
        if (Object.keys(refs).length) {
          await this.tips.record(repo, refs, checkedAt);
          if (!versions.length || !sameBranchTips(versions[0].refs, refs)) {
            const bundle = await this.bundles.create(directory, repo, refs, signal);
            status.verifiedAt = bundle.verifiedAt;
            await this.rememberVerification(directory, repo.key, status.verifiedAt);
            await this.bundles.retainLatest(directory, repo);
          }
        }
      } catch (error) {
        if (signal.aborted) throw error;
        status.lastError = error instanceof Error ? error.message : String(error);
      }
      this.statuses.set(repoPath, status);
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    clearTimeout(this.timer);
    this.controller.abort();
    await this.ticking;
  }
}
