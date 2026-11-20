import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  BranchBackupOutcome,
  BranchBackupOverview,
  BranchBackupRemoval,
  BranchBackupSelection,
  BranchBackupStatus,
} from '../../src/shared/ipc/branchRecovery';
import { repositoryPathKey } from '../main-process/activeRepositoryAuthorization';
import { writeTextFileAtomicallyAsync } from '../main-process/atomicFile';
import { assertManagedPathAsync, readStorageJsonAsync } from '../main-process/storageSafety';
import {
  branchBundleId,
  branchBundleRepositoryKey,
  BranchBundleStore,
  readBranchTips,
  sameBranchTips,
  withinDirectory,
  type BranchBundle,
} from './branchBundles';
import { branchReadOptions, describeBranchRepository, isMissing, recoveryDirectoryKey, type BranchRepository } from './branchRecoveryRepository';
import { readRepositoryFileBytes } from './RepositoryFileRead';
import type { BranchTipJournal } from './BranchTipJournal';
import type { GitRunner } from './GitRunner';
import type { RepositoryHeadService } from './RepositoryHeadService';

const intervalMs = 15 * 60_000;
const interruptedRetryMs = 5_000;
const retainedVersions = 3;
type Preferences = { enabled: boolean; directory: string | null; automatic: string[] };
type CheckStatus = { checkedAt: number } & Pick<BranchBackupStatus, 'verifiedAt' | 'lastError'>;
type RemovalPreview = {
  selection: BranchBackupRemoval;
  root: string;
  rootKey: string;
  repositoryPath: string | null;
  remove: BranchBundle[];
  keep?: BranchBundle;
  lastVersion: boolean;
};

export class BranchBackupService {
  private preferences: Preferences = { enabled: false, directory: null, automatic: [] };
  private readonly statuses = new Map<string, CheckStatus>();
  private readonly due = new Map<string, number>();
  private readonly verifiedTimes = new Map<string, number>();
  private readonly busy = new Set<string>();
  private readonly manualJobs = new Map<string, Promise<BranchBackupOutcome>>();
  private work = Promise.resolve();
  private ticking?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly controller = new AbortController();
  private disposed = false;
  private readonly ready: Promise<void>;
  private readonly defaultDirectory: string;
  readonly bundles: BranchBundleStore;

  constructor(
    private readonly profile: string,
    private readonly git: GitRunner,
    private readonly heads: RepositoryHeadService,
    private readonly tips: BranchTipJournal,
    private readonly localRepositories: () => string[],
  ) {
    this.defaultDirectory = path.join(profile, 'Repository-Backups');
    this.bundles = new BranchBundleStore(git);
    this.ready = this.loadPreferences();
    void this.ready.then(() => this.repositoriesChanged()).catch(() => {});
  }

  private get preferencesFile() {
    return path.join(this.profile, 'branch-backups.json');
  }

  private async loadPreferences() {
    try {
      const value = (await readStorageJsonAsync(this.profile, this.preferencesFile)) as Partial<Preferences> | null;
      if (!value || typeof value !== 'object') return;
      const enabled = value.enabled === true;
      const directory = typeof value.directory === 'string' && path.isAbsolute(value.directory) ? value.directory : null;
      const legacy = !Array.isArray(value.automatic);
      const automatic = legacy
        ? enabled
          ? [...this.localRepositories()]
          : []
        : value.automatic!.filter((entry) => typeof entry === 'string' && path.isAbsolute(entry));
      this.preferences = { enabled, directory, automatic };
      if (legacy) await writeTextFileAtomicallyAsync(this.preferencesFile, JSON.stringify(this.preferences), this.profile);
      await this.loadVerificationTimes(directory ?? this.defaultDirectory);
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
      if (branchBundleRepositoryKey.test(key) && Number.isSafeInteger(timestamp) && timestamp > 0) this.verifiedTimes.set(key, timestamp);
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

  private async target(preferences: Preferences, createDefault = false): Promise<string> {
    if (preferences.directory) return preferences.directory;
    await assertManagedPathAsync(this.profile, this.defaultDirectory);
    if (createDefault) await fs.mkdir(this.defaultDirectory, { recursive: true, mode: 0o700 });
    return fs.realpath(this.defaultDirectory).catch((error: unknown) => {
      if (!createDefault && isMissing(error)) return this.defaultDirectory;
      throw error;
    });
  }

  async overview(): Promise<BranchBackupOverview> {
    await this.ready;
    const preferences = this.preferences;
    let directoryError: string | null = null;
    const inventory = await this.target(preferences)
      .then((root) => this.bundles.inventory(root, !preferences.directory))
      .catch((error: unknown) => {
        directoryError = errorMessage(error);
        return new Map<string, BranchBundle[]>();
      });
    const claimed = new Set<string>();
    const automatic = new Set(preferences.automatic.map(repositoryPathKey));
    const repositories = await Promise.all(
      this.localRepositories().map(async (repoPath): Promise<BranchBackupStatus> => {
        const key = repositoryPathKey(repoPath);
        const identity = await localBackupKey(repoPath).catch(() => null);
        const stored = [...inventory].find(([, versions]) => versions.some((version) => version.repoPath && repositoryPathKey(version.repoPath) === key))?.[0];
        const repositoryKey = identity ?? stored ?? null;
        if (repositoryKey) claimed.add(repositoryKey);
        const versions = repositoryKey ? (inventory.get(repositoryKey) ?? []) : [];
        const latest = this.statuses.get(key);
        return {
          repoPath,
          repositoryKey,
          registered: true,
          automatic: automatic.has(key),
          busy: this.busy.has(key) || this.manualJobs.has(key),
          checkedAt: latest?.checkedAt ?? null,
          verifiedAt:
            versions[0]?.verifiedAt ?? (directoryError ? ((repositoryKey ? this.verifiedTimes.get(repositoryKey) : latest?.verifiedAt) ?? null) : null),
          lastError: latest?.lastError ?? null,
          versions: versionSummaries(versions),
        };
      }),
    );
    for (const [repositoryKey, versions] of inventory) {
      if (claimed.has(repositoryKey)) continue;
      repositories.push({
        repoPath: versions.find((version) => version.repoPath)?.repoPath ?? null,
        repositoryKey,
        registered: false,
        automatic: false,
        busy: false,
        checkedAt: null,
        verifiedAt: versions[0].verifiedAt,
        lastError: null,
        versions: versionSummaries(versions),
      });
    }
    const versions = [...inventory.values()].flat();
    return {
      enabled: preferences.enabled,
      directory: preferences.directory ?? this.defaultDirectory,
      defaultDirectory: this.defaultDirectory,
      directoryError,
      versionCount: versions.length,
      totalBytes: versions.reduce((sum, version) => sum + version.bytes, 0),
      repositories,
    };
  }

  async versions(repo: BranchRepository): Promise<BranchBundle[]> {
    await this.ready;
    const preferences = this.preferences;
    try {
      return await this.bundles.versions(await this.target(preferences), repo);
    } catch (error) {
      if (!preferences.directory && isMissing(error)) return [];
      throw error;
    }
  }

  async chooseDirectory(directory: string): Promise<BranchBackupOverview> {
    const canonical = await fs.realpath(directory);
    if (!(await fs.stat(canonical)).isDirectory()) throw new Error('Choose a backup directory.');
    for (const repo of this.localRepositories()) {
      const real = await fs.realpath(repo).catch(() => path.resolve(repo));
      if (withinDirectory(real, canonical)) throw new Error('The backup directory must be outside the local repositories.');
    }
    const insideGit = await this.git.runResult(canonical, ['rev-parse', '--git-dir'], branchReadOptions()).catch(() => null);
    if (insideGit?.exitCode === 0) throw new Error('Choose a directory outside Git repositories.');
    const defaultLocation = await fs.realpath(this.defaultDirectory).catch(() => this.defaultDirectory);
    return this.change((current) => ({ ...current, directory: path.relative(defaultLocation, canonical) ? canonical : null }));
  }

  resetDirectory() {
    return this.change((current) => ({ ...current, directory: null }));
  }

  enable(enabled: boolean): Promise<BranchBackupOverview> {
    return this.change((current) => ({ ...current, enabled }));
  }

  setSelection(selection: BranchBackupSelection): Promise<BranchBackupOverview> {
    return this.change((current) => {
      if (selection.repoPath === undefined) return { ...current, automatic: selection.automatic ? [...this.localRepositories()] : [] };
      const repoPath = this.requireRepository(selection.repoPath);
      const repoKey = repositoryPathKey(repoPath);
      const automatic = current.automatic.filter((entry) => repositoryPathKey(entry) !== repoKey);
      if (selection.automatic) automatic.push(repoPath);
      return { ...current, automatic };
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.work.then(() => {
      this.controller.signal.throwIfAborted();
      return operation();
    });
    this.work = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private async change(update: (value: Preferences) => Preferences): Promise<BranchBackupOverview> {
    await this.ready;
    await this.enqueue(async () => {
      const previous = this.preferences;
      const next = update(previous);
      await writeTextFileAtomicallyAsync(this.preferencesFile, JSON.stringify(next), this.profile);
      this.preferences = next;
      if (next.directory !== previous.directory) {
        this.due.clear();
        this.statuses.clear();
        this.verifiedTimes.clear();
        await this.loadVerificationTimes(next.directory ?? this.defaultDirectory);
      }
      this.repositoriesChanged();
    });
    return this.overview();
  }

  private requireRepository(requested: string) {
    const repo = this.localRepositories().find((entry) => repositoryPathKey(entry) === repositoryPathKey(requested));
    if (!repo) throw new Error('Choose a registered local repository.');
    return repo;
  }

  private automaticRepositories() {
    if (!this.preferences.enabled) return [];
    const automatic = new Set(this.preferences.automatic.map(repositoryPathKey));
    return this.localRepositories().filter((repo) => automatic.has(repositoryPathKey(repo)));
  }

  repositoriesChanged() {
    clearTimeout(this.timer);
    if (this.disposed) return;
    const repositories = this.automaticRepositories();
    const keys = new Set(repositories.map(repositoryPathKey));
    for (const key of this.due.keys()) if (!keys.has(key)) this.due.delete(key);
    if (!repositories.length || this.ticking) return;
    const now = Date.now();
    const next = repositories.reduce((nextTime, repo) => Math.min(nextTime, this.due.get(repositoryPathKey(repo)) ?? now), now + intervalMs);
    this.timer = setTimeout(() => this.startTick(), Math.max(0, next - now));
    this.timer.unref();
  }

  private startTick() {
    if (this.disposed || this.ticking) return;
    this.ticking = this.checkSelectedRepositories()
      .catch(() => {})
      .finally(() => {
        this.ticking = undefined;
        this.repositoriesChanged();
      });
  }

  private async checkSelectedRepositories() {
    for (const repoPath of this.automaticRepositories()) {
      const key = repositoryPathKey(repoPath);
      if ((this.due.get(key) ?? 0) > Date.now()) continue;
      await this.enqueue(async () => {
        if (!this.automaticRepositories().some((repo) => repositoryPathKey(repo) === key)) return;
        if ((this.due.get(key) ?? 0) > Date.now()) return;
        await this.backup(repoPath, false).catch(() => {});
      });
    }
  }

  async backupNow(requested: string): Promise<BranchBackupOutcome> {
    await this.ready;
    const repoPath = this.requireRepository(requested);
    const key = repositoryPathKey(repoPath);
    const existing = this.manualJobs.get(key);
    if (existing) return existing;
    const result = this.enqueue(() => this.backup(this.requireRepository(repoPath), true));
    this.manualJobs.set(key, result);
    try {
      return await result;
    } finally {
      this.manualJobs.delete(key);
    }
  }

  private async backup(repoPath: string, manual: boolean): Promise<BranchBackupOutcome> {
    const key = repositoryPathKey(repoPath);
    const signal = AbortSignal.any([this.controller.signal]);
    const checkedAt = Date.now();
    this.due.set(key, checkedAt + intervalMs);
    const previous = this.statuses.get(key);
    const status: CheckStatus = { checkedAt, verifiedAt: previous?.verifiedAt ?? null, lastError: previous?.lastError ?? null };
    this.busy.add(key);
    this.statuses.set(key, status);
    try {
      const outcome = await this.saveBackup(repoPath, manual, status, signal);
      status.lastError = null;
      return outcome;
    } catch (error) {
      if (!signal.aborted && error instanceof Error && error.name === 'AbortError') {
        // A foreground Git write can interrupt an individual preflight job.
        this.due.set(key, Date.now() + interruptedRetryMs);
        if (manual) this.repositoriesChanged();
      } else if (!signal.aborted && !manual) {
        status.lastError = errorMessage(error);
      }
      throw error;
    } finally {
      this.busy.delete(key);
    }
  }

  private async saveBackup(repoPath: string, manual: boolean, status: CheckStatus, signal: AbortSignal): Promise<BranchBackupOutcome> {
    const options = { signal, requestedKind: 'preflight' as const };
    const repo = await describeBranchRepository(this.git, repoPath, options);
    const preferences = this.preferences;
    const directory = preferences.directory ?? this.defaultDirectory;
    status.verifiedAt = this.verifiedTimes.get(repo.key) ?? null;
    if (!preferences.directory && [await fs.realpath(repoPath), repo.gitDir, repo.commonDir].some((base) => withinDirectory(base, this.defaultDirectory))) {
      throw new Error('The default backup directory is inside this repository. Choose another destination.');
    }
    const root = await this.target(preferences, true);
    const versions = await this.bundles.versions(root, repo);
    status.verifiedAt = versions[0]?.verifiedAt ?? null;
    await this.rememberVerification(directory, repo.key, status.verifiedAt);
    await this.heads.read(repoPath, options);
    const refs = await readBranchTips(this.git, repo, signal);
    if (!Object.keys(refs).length) return 'empty';
    await this.tips.record(repo, refs, status.checkedAt);
    const newest = versions[0];
    if (newest && sameBranchTips(newest.refs, refs) && (!manual || (await this.bundles.isIntact(newest, signal)))) {
      if (versions.length > retainedVersions) await this.bundles.retainLatest(root, repo, retainedVersions);
      return 'up-to-date';
    }
    const saved = await this.bundles.create(root, repo, refs, signal);
    status.verifiedAt = saved.verifiedAt;
    await this.rememberVerification(directory, repo.key, status.verifiedAt);
    await this.bundles.retainLatest(root, repo, retainedVersions);
    return 'created';
  }

  async previewRemoval(selection: BranchBackupRemoval): Promise<RemovalPreview> {
    await this.ready;
    if (!branchBundleRepositoryKey.test(selection.repositoryKey) || (selection.versionId !== undefined && !branchBundleId.test(selection.versionId))) {
      throw new Error('Choose a managed backup version.');
    }
    const root = await this.target(this.preferences);
    const rootKey = await recoveryDirectoryKey(root);
    const versions = await this.bundles.versionsByKey(root, selection.repositoryKey);
    const keep = selection.versionId === undefined ? versions[0] : undefined;
    const remove = selection.versionId === undefined ? versions.slice(1) : versions.filter((version) => version.id === selection.versionId);
    if (!remove.length) throw new Error('The selected backup versions are no longer available.');
    let owner = versions.find((version) => version.repoPath)?.repoPath ?? null;
    if (!owner) {
      for (const repo of this.localRepositories()) {
        if ((await localBackupKey(repo).catch(() => null)) === selection.repositoryKey) {
          owner = repo;
          break;
        }
      }
    }
    return {
      selection,
      root,
      rootKey,
      repositoryPath: owner,
      remove,
      keep,
      lastVersion: remove.length === versions.length,
    };
  }

  async remove(approved: RemovalPreview): Promise<number> {
    return this.enqueue(async () => {
      const current = await this.previewRemoval(approved.selection);
      const signature = (versions: BranchBundle[]) => JSON.stringify(versions.map(({ id, identity }) => [id, identity]));
      if (
        path.relative(current.root, approved.root) ||
        current.rootKey !== approved.rootKey ||
        current.lastVersion !== approved.lastVersion ||
        current.keep?.id !== approved.keep?.id ||
        current.keep?.identity !== approved.keep?.identity ||
        signature(current.remove) !== signature(approved.remove)
      )
        throw new Error('The backup selection changed. Review it again.');
      if (current.keep) {
        if (!(await this.bundles.isIntact(current.keep, this.controller.signal))) {
          throw new Error('The newest backup failed its integrity check. Create a new verified backup before cleaning up earlier versions.');
        }
        const newest = (await this.bundles.versionsByKey(current.root, current.selection.repositoryKey))[0];
        if (newest?.identity !== current.keep.identity) throw new Error('The backup selection changed. Review it again.');
      }
      if ((await recoveryDirectoryKey(current.root)) !== current.rootKey) throw new Error('The backup directory changed.');
      await this.bundles.removeVersions(current.root, current.remove);
      const latest = (await this.bundles.versionsByKey(current.root, current.selection.repositoryKey))[0];
      await this.rememberVerification(this.preferences.directory ?? this.defaultDirectory, current.selection.repositoryKey, latest?.verifiedAt ?? null);
      return current.remove.length;
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    clearTimeout(this.timer);
    this.controller.abort();
    await this.ready;
    await this.ticking;
    await this.work;
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const versionSummaries = (versions: BranchBundle[]) => versions.map(({ id, verifiedAt, bytes }) => ({ id, verifiedAt, bytes }));

/** Read the Git directories without launching Git for every settings refresh. */
async function localBackupKey(repoPath: string): Promise<string> {
  const dotGit = path.join(repoPath, '.git');
  const dotGitStat = await fs.stat(dotGit).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  let gitDir = dotGit;
  if (dotGitStat?.isFile()) {
    const pointer = (await readRepositoryFileBytes(dotGit, 4096)).data.toString('utf8').replace(/\r?\n$/, '');
    if (!pointer.startsWith('gitdir: ')) throw new Error('Invalid Git directory pointer.');
    gitDir = path.resolve(repoPath, pointer.slice(8));
  } else if (!dotGitStat) {
    await fs.stat(path.join(repoPath, 'HEAD'));
    if (!(await fs.stat(path.join(repoPath, 'objects'))).isDirectory()) throw new Error('Invalid Git object directory.');
    gitDir = repoPath;
  }
  const common = await readRepositoryFileBytes(path.join(gitDir, 'commondir'), 4096).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  return recoveryDirectoryKey(common ? path.resolve(gitDir, common.data.toString('utf8').replace(/\r?\n$/, '')) : gitDir);
}
