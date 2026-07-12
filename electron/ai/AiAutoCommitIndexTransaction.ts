import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { GitService } from '../GitService';
import { cleanupPrivateTempDir, createPrivateTempDir, writePrivateTempFile } from '../git/PrivateTempFiles';
import { toLiteralPathspec } from '../git/RepositoryPathSafety';
import type { CommitMessage, SnapshotFile } from './aiServiceTypes';
import type { StatusEntry } from './gitStatusSnapshot';

type EnvironmentGitService = GitService & {
  runCommandAtPathWithEnv?: (repoPath: string, args: string[], envOverrides: NodeJS.ProcessEnv) => Promise<string>;
};

type ReflogEntry = {
  hash: string;
  subject: string;
};

type RollbackOutcome = 'unchanged' | 'rolled-back' | 'unsafe';

const REFLOG_SCAN_LIMIT = 256;

const removeIfPresent = (filePath: string): void => {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // A later Git command will surface a useful error if cleanup was impossible.
  }
};

/**
 * Creates AI commits without ever staging the live working tree in the user's
 * index. A private index captures the initial working-tree snapshot. Each
 * commit is assembled from that immutable tree in another private index.
 *
 * Immediately before a commit, the real index is locked and copied. The copy
 * is prepared for the post-commit HEAD and is promoted only after Git created
 * exactly the expected tree. Cancellation and every failed commit therefore
 * leave the original staged tree, including partial staging, untouched.
 */
export class AiAutoCommitIndexTransaction {
  private readonly git: EnvironmentGitService;
  private readonly tempDir: string;
  private readonly snapshotIndexPath: string;
  private snapshotTree: string | null = null;
  private expectedHead: string | null = null;
  private expectedHeadRef: string | null = null;
  private expectedRealIndexTree: string | null = null;
  private expectedRealIndexFingerprint: string | null = null;
  private realIndexPath: string | null = null;
  private committablePaths: Set<string> | null = null;
  private nonCommittableSubmodulePaths = new Set<string>();
  private initialized = false;

  constructor(
    gitService: GitService,
    private readonly repoPath: string,
    private readonly beforeCommit?: (privateIndexPath: string) => Promise<void>,
  ) {
    this.git = gitService as EnvironmentGitService;
    this.tempDir = createPrivateTempDir('ogc-ai-index-');
    this.snapshotIndexPath = path.join(this.tempDir, 'snapshot.index');
  }

  get supported(): boolean {
    return typeof this.git.runCommandAtPathWithEnv === 'function';
  }

  get snapshotIndexPathForRead(): string {
    return this.snapshotIndexPath;
  }

  async initialize(entries: StatusEntry[]): Promise<void> {
    if (!this.supported) return;
    if (this.initialized) throw new Error('AI index transaction was already initialized.');

    this.expectedHead = await this.readHead();
    this.expectedHeadRef = await this.readHeadRef();
    this.realIndexPath = await this.resolveRealIndexPath();
    const realIndexState = await this.readRealIndexState();
    this.expectedRealIndexTree = realIndexState.tree;
    this.expectedRealIndexFingerprint = realIndexState.fingerprint;

    await this.initializePrivateIndex(this.snapshotIndexPath, this.expectedHead);
    const affectedPaths = this.collectStatusPaths(entries);
    if (affectedPaths.length === 0) throw new Error('No files are available for the AI snapshot.');
    const pathspecFile = this.writePathspecFile('snapshot.paths', affectedPaths);
    await this.runWithIndex(this.snapshotIndexPath, ['add', '-A', `--pathspec-from-file=${pathspecFile}`, '--pathspec-file-nul']);
    this.snapshotTree = (await this.runWithIndex(this.snapshotIndexPath, ['write-tree'])).trim();
    if (!this.snapshotTree) throw new Error('AI working-tree snapshot could not be created.');
    this.committablePaths = await this.readSnapshotChangedPaths();
    this.nonCommittableSubmodulePaths = await this.readNonCommittableSubmodulePaths(entries);
    this.initialized = true;
  }

  isStatusEntryCommittable(entry: StatusEntry): boolean {
    if (!this.supported || !this.committablePaths) return true;
    return this.committablePaths.has(entry.path) || Boolean(entry.originalPath && this.committablePaths.has(entry.originalPath));
  }

  getNonCommittableSubmodulePaths(): string[] {
    return [...this.nonCommittableSubmodulePaths];
  }

  async commit(batchFiles: SnapshotFile[], message: CommitMessage): Promise<string> {
    if (!this.supported || !this.initialized || !this.snapshotTree || !this.realIndexPath || !this.expectedRealIndexTree) {
      throw new Error('AI index transaction is not initialized.');
    }

    const affectedPaths = this.collectSnapshotPaths(batchFiles);
    if (affectedPaths.length === 0) throw new Error('AI commit batch contains no paths.');

    const batchIndexPath = path.join(this.tempDir, `batch-${Date.now()}-${Math.random().toString(16).slice(2)}.index`);
    const pathspecFile = this.writePathspecFile(`batch-${Date.now()}-${Math.random().toString(16).slice(2)}.paths`, affectedPaths);
    await this.initializePrivateIndex(batchIndexPath, this.expectedHead);
    const baseTree = (await this.runWithIndex(batchIndexPath, ['write-tree'])).trim();
    await this.restorePathsFromTree(batchIndexPath, this.snapshotTree, affectedPaths, pathspecFile);
    const expectedCommitTree = (await this.runWithIndex(batchIndexPath, ['write-tree'])).trim();
    if (expectedCommitTree === baseTree) {
      throw new Error('AI commit batch contains no changes that can be committed in the parent repository.');
    }
    await this.beforeCommit?.(batchIndexPath);

    const currentHead = await this.readHead();
    const currentHeadRef = await this.readHeadRef();
    if (currentHead !== this.expectedHead || currentHeadRef !== this.expectedHeadRef) {
      throw new Error('Repository HEAD changed while AI Auto-Commit was running. No commit was created.');
    }

    const indexLockPath = `${this.realIndexPath}.lock`;
    this.acquireRealIndexLock(indexLockPath);
    const targetRef = this.expectedHeadRef || 'HEAD';
    const reflogAction = `open-git-control-ai-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let commitAttempted = false;
    let commitFinalized = false;
    try {
      const realIndexExisted = await this.seedLockedIndex(indexLockPath);
      const currentIndexFingerprint = realIndexExisted ? await this.fingerprintIndex(indexLockPath) : null;
      if (currentIndexFingerprint !== this.expectedRealIndexFingerprint) {
        throw new Error('Git index changed while AI Auto-Commit was running. No commit was created.');
      }
      const currentIndexTree = (await this.runWithIndex(indexLockPath, ['write-tree'])).trim();
      if (currentIndexTree !== this.expectedRealIndexTree) {
        throw new Error('Git index changed while AI Auto-Commit was running. No commit was created.');
      }

      // Prepare the exact real-index state that should become visible after a
      // successful commit. It remains in index.lock until the commit is proven.
      await this.restorePathsFromTree(indexLockPath, expectedCommitTree, affectedPaths, pathspecFile);
      const nextRealIndexTree = (await this.runWithIndex(indexLockPath, ['write-tree'])).trim();
      const nextRealIndexFingerprint = await this.fingerprintIndex(indexLockPath);

      const messageFile = path.join(this.tempDir, `message-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
      const normalizedDescription = message.description.trim();
      writePrivateTempFile(messageFile, normalizedDescription ? `${message.title}\n\n${normalizedDescription}` : message.title);

      // Re-check after taking the index lock. Commands on the repository are
      // scheduled individually, so another process can still move a ref in
      // the interval between snapshot preparation and this commit.
      if ((await this.readHead()) !== this.expectedHead || (await this.readHeadRef()) !== this.expectedHeadRef) {
        throw new Error('Repository HEAD changed while AI Auto-Commit was running. No commit was created.');
      }

      // The unique reflog action is inherited by hooks and by Git processes
      // started from those hooks. It lets failure recovery distinguish our
      // entire commit chain from an unrelated ref update. Enabling reflogs for
      // this command also covers repositories that disabled them globally.
      commitAttempted = true;
      await this.runWithIndex(batchIndexPath, ['-c', 'core.logAllRefUpdates=true', 'commit', '-F', messageFile], { GIT_REFLOG_ACTION: reflogAction });

      const createdHeadRef = await this.readHeadRef();
      const createdHead = await this.readTransactionRefValue(targetRef);
      if (!createdHead || createdHead === this.expectedHead) {
        throw new Error('Git reported success but did not create an AI commit.');
      }

      const createdParents = await this.readCommitParents(createdHead);
      const expectedParents = this.expectedHead ? [this.expectedHead] : [];
      if (
        createdHeadRef !== this.expectedHeadRef ||
        (await this.readHead()) !== createdHead ||
        createdParents.length !== expectedParents.length ||
        createdParents[0] !== expectedParents[0]
      ) {
        throw new Error('Repository HEAD changed while the AI commit was being created.');
      }

      // Hooks inherit GIT_INDEX_FILE and are allowed to inspect the batch, but
      // they must not silently replace snapshotted blobs with later worktree
      // edits. Verify the durable commit tree and roll the ref back if needed.
      const committedTree = (await this.run(['rev-parse', `${createdHead}^{tree}`])).trim();
      if (committedTree !== expectedCommitTree) {
        throw new Error('A Git hook changed the AI snapshot.');
      }

      try {
        fs.renameSync(indexLockPath, this.realIndexPath);
      } catch (error) {
        throw new Error(`AI commit index could not be finalized: ${error instanceof Error ? error.message : String(error)}`);
      }

      this.expectedHead = createdHead;
      this.expectedRealIndexTree = nextRealIndexTree;
      this.expectedRealIndexFingerprint = nextRealIndexFingerprint;
      commitFinalized = true;
      return createdHead;
    } catch (error: unknown) {
      if (commitAttempted && !commitFinalized) {
        const rollbackOutcome = await this.rollbackOwnedRefChanges(targetRef, reflogAction).catch(() => 'unsafe' as const);
        if (rollbackOutcome === 'unsafe') {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            `${message} The repository ref was not rewritten because a concurrent non-AI ref update was detected; no foreign commit was removed.`,
          );
        }
      }
      throw error;
    } finally {
      // On every failure before promotion, removing index.lock exposes the
      // exact original index again. After promotion this path no longer exists.
      removeIfPresent(indexLockPath);
      removeIfPresent(`${indexLockPath}.lock`);
      removeIfPresent(batchIndexPath);
      removeIfPresent(`${batchIndexPath}.lock`);
    }
  }

  dispose(): void {
    cleanupPrivateTempDir(this.tempDir);
  }

  private collectStatusPaths(entries: StatusEntry[]): string[] {
    return [
      ...new Set(
        entries.flatMap((entry) => [entry.path, entry.originalPath].filter((value): value is string => typeof value === 'string' && value.length > 0)),
      ),
    ];
  }

  private collectSnapshotPaths(files: SnapshotFile[]): string[] {
    return [
      ...new Set(files.flatMap((file) => [file.path, file.originalPath].filter((value): value is string => typeof value === 'string' && value.length > 0))),
    ];
  }

  private async readSnapshotChangedPaths(): Promise<Set<string>> {
    const raw = this.expectedHead
      ? await this.runWithIndex(this.snapshotIndexPath, ['diff', '--cached', '--name-only', '--no-renames', '-z', this.expectedHead, '--'])
      : await this.runWithIndex(this.snapshotIndexPath, ['ls-files', '-z']);
    return new Set(raw.split('\0').filter(Boolean));
  }

  private async readNonCommittableSubmodulePaths(entries: StatusEntry[]): Promise<Set<string>> {
    if (!this.committablePaths) return new Set();
    const nonCommittable = entries.filter((entry) => !this.isStatusEntryCommittable(entry));
    if (nonCommittable.length === 0) return new Set();
    const paths = [...new Set(nonCommittable.map((entry) => entry.path))];
    const raw = await this.runWithIndex(this.snapshotIndexPath, ['ls-files', '--stage', '-z', '--', ...paths.map((filePath) => toLiteralPathspec(filePath))]);
    const submodules = new Set<string>();
    for (const record of raw.split('\0')) {
      const match = record.match(/^160000 [0-9a-f]+ \d+\t([\s\S]+)$/i);
      if (match) submodules.add(match[1]);
    }
    return submodules;
  }

  private writePathspecFile(fileName: string, paths: string[]): string {
    const filePath = path.join(this.tempDir, fileName);
    writePrivateTempFile(filePath, `${paths.map((value) => toLiteralPathspec(value)).join('\0')}\0`);
    return filePath;
  }

  private async restorePathsFromTree(indexPath: string, sourceTree: string, paths: string[], pathspecFile: string): Promise<void> {
    const existingRaw = await this.runWithIndex(indexPath, [
      'ls-tree',
      '-r',
      '-z',
      '--name-only',
      sourceTree,
      '--',
      ...paths.map((filePath) => toLiteralPathspec(filePath)),
    ]);
    const existingPaths = existingRaw.split('\0').filter(Boolean);
    const existingSet = new Set(existingPaths);
    const absentPaths = paths.filter((filePath) => !existingSet.has(filePath));

    if (existingPaths.length > 0) {
      const existingPathspecFile = this.writePathspecFile(`${path.basename(pathspecFile)}.existing`, existingPaths);
      await this.runWithIndex(indexPath, [
        'restore',
        `--source=${sourceTree}`,
        '--staged',
        `--pathspec-from-file=${existingPathspecFile}`,
        '--pathspec-file-nul',
      ]);
    }
    if (absentPaths.length > 0) {
      await this.runWithIndex(indexPath, ['rm', '--cached', '-f', '--ignore-unmatch', '--', ...absentPaths.map((filePath) => toLiteralPathspec(filePath))]);
    }
  }

  private async initializePrivateIndex(indexPath: string, head: string | null): Promise<void> {
    removeIfPresent(indexPath);
    removeIfPresent(`${indexPath}.lock`);
    await this.runWithIndex(indexPath, head ? ['read-tree', head] : ['read-tree', '--empty']);
  }

  private async seedLockedIndex(indexLockPath: string): Promise<boolean> {
    if (!this.realIndexPath) throw new Error('Git index path is unavailable.');
    if (fs.existsSync(this.realIndexPath)) {
      fs.copyFileSync(this.realIndexPath, indexLockPath);
      return true;
    }
    const emptyIndex = path.join(this.tempDir, 'empty.index');
    if (!fs.existsSync(emptyIndex)) {
      await this.initializePrivateIndex(emptyIndex, null);
    }
    fs.copyFileSync(emptyIndex, indexLockPath);
    return false;
  }

  private acquireRealIndexLock(indexLockPath: string): void {
    fs.mkdirSync(path.dirname(indexLockPath), { recursive: true });
    let descriptor: number | null = null;
    try {
      descriptor = fs.openSync(indexLockPath, 'wx', 0o600);
    } catch (error) {
      throw new Error(`Git index is busy. AI Auto-Commit did not modify it: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (descriptor !== null) fs.closeSync(descriptor);
    }
  }

  private async resolveRealIndexPath(): Promise<string> {
    const raw = await this.run(['rev-parse', '--path-format=absolute', '--git-path', 'index']);
    const withoutTerminator = raw.replace(/\r?\n$/, '');
    if (!withoutTerminator) throw new Error('Git index path could not be resolved.');
    return path.isAbsolute(withoutTerminator) ? withoutTerminator : path.resolve(this.repoPath, withoutTerminator);
  }

  private async readRealIndexState(): Promise<{ tree: string; fingerprint: string | null }> {
    if (this.realIndexPath && fs.existsSync(this.realIndexPath)) {
      const baselineIndex = path.join(this.tempDir, 'baseline.index');
      fs.copyFileSync(this.realIndexPath, baselineIndex);
      return {
        tree: (await this.runWithIndex(baselineIndex, ['write-tree'])).trim(),
        fingerprint: await this.fingerprintIndex(baselineIndex),
      };
    }
    const emptyIndex = path.join(this.tempDir, 'empty.index');
    await this.initializePrivateIndex(emptyIndex, null);
    return { tree: (await this.runWithIndex(emptyIndex, ['write-tree'])).trim(), fingerprint: null };
  }

  private async fingerprintIndex(indexPath: string): Promise<string> {
    // Index stat/cache-tree/fsmonitor extensions may be refreshed by harmless
    // status polling. Hash only durable staged entries and user-controlled
    // flags so those refreshes do not abort a multi-batch AI run.
    const stagedEntries = await this.runWithIndex(indexPath, ['ls-files', '--stage', '-z']);
    const entryFlags = await this.runWithIndex(indexPath, ['ls-files', '-v', '-z']);
    return createHash('sha256').update(stagedEntries).update('\0').update(entryFlags).digest('hex');
  }

  private async readHead(): Promise<string | null> {
    try {
      const value = (await this.run(['rev-parse', '--verify', 'HEAD'])).trim();
      return value || null;
    } catch {
      return null;
    }
  }

  private async readHeadRef(): Promise<string | null> {
    try {
      const value = (await this.run(['symbolic-ref', '-q', 'HEAD'])).trim();
      return value || null;
    } catch {
      return null;
    }
  }

  private async readCommitParents(commit: string): Promise<string[]> {
    const record = (await this.run(['rev-list', '--parents', '-n', '1', commit])).trim();
    if (!record) return [];
    return record.split(/\s+/).slice(1);
  }

  private async readTransactionRefValue(targetRef: string): Promise<string | null> {
    // A detached HEAD has no persistent ref name. If another process attached
    // HEAD to a branch, the AI commit is no longer referenced by HEAD and that
    // branch must never be treated as our rollback target.
    if (targetRef === 'HEAD' && (await this.readHeadRef()) !== null) return null;
    try {
      const value = (await this.run(['rev-parse', '--verify', targetRef])).trim();
      return value || null;
    } catch {
      return null;
    }
  }

  private async readReflog(ref: string): Promise<ReflogEntry[] | null> {
    try {
      const raw = await this.run(['reflog', 'show', `--max-count=${REFLOG_SCAN_LIMIT}`, '--format=%H%x00%gs', ref]);
      if (!raw) return [];
      return raw.split(/\r?\n/).flatMap((line) => {
        const separator = line.indexOf('\0');
        if (separator <= 0) return [];
        const hash = line.slice(0, separator).trim();
        if (!hash) return [];
        return [{ hash, subject: line.slice(separator + 1) }];
      });
    } catch {
      return null;
    }
  }

  private async rollbackOwnedRefChanges(targetRef: string, reflogAction: string): Promise<RollbackOutcome> {
    if (targetRef === 'HEAD' && (await this.readHeadRef()) !== null) {
      // The original detached HEAD was replaced. Its AI commit is now
      // unreachable, while HEAD refers to someone else's branch.
      return 'unchanged';
    }

    const currentHead = await this.readTransactionRefValue(targetRef);
    if (currentHead === this.expectedHead) return 'unchanged';
    if (!currentHead) return this.expectedHead ? 'unsafe' : 'unchanged';

    const entries = await this.readReflog(targetRef);
    const ownsEntry = (entry: ReflogEntry): boolean => entry.subject === reflogAction || entry.subject.startsWith(`${reflogAction}:`);
    if (!entries || entries.length === 0 || entries[0].hash !== currentHead || !ownsEntry(entries[0])) {
      return 'unsafe';
    }

    const ownedEntries: ReflogEntry[] = [];
    for (const entry of entries) {
      if (!ownsEntry(entry)) break;
      ownedEntries.push(entry);
    }
    if (ownedEntries.length === REFLOG_SCAN_LIMIT) return 'unsafe';

    // If an unrelated commit landed after ours, it is the newest unowned
    // reflog entry and recovery deliberately refuses to rewrite it. The oldest
    // nonce-bearing entry is the commit made by this transaction (or by a
    // failing pre-commit hook); its first parent is therefore the safe boundary
    // even when a later hook amended/replaced that commit rather than extending
    // it as a strict first-parent chain.
    const oldestParents = await this.readCommitParents(ownedEntries[ownedEntries.length - 1].hash);
    const rollbackTarget = oldestParents[0] || null;

    const updateArgs = targetRef === 'HEAD' ? ['update-ref', '--no-deref'] : ['update-ref'];
    if (rollbackTarget) {
      await this.run([...updateArgs, '-m', 'rollback failed AI auto-commit', targetRef, rollbackTarget, currentHead]);
    } else {
      await this.run([...updateArgs, '-d', targetRef, currentHead]);
    }
    return 'rolled-back';
  }

  private async run(args: string[]): Promise<string> {
    return this.git.runCommandAtPath(this.repoPath, args);
  }

  private async runWithIndex(indexPath: string, args: string[], envOverrides: NodeJS.ProcessEnv = {}): Promise<string> {
    if (!this.git.runCommandAtPathWithEnv) throw new Error('Environment-isolated Git commands are unavailable.');
    return this.git.runCommandAtPathWithEnv(this.repoPath, args, {
      GIT_INDEX_FILE: indexPath,
      GIT_OPTIONAL_LOCKS: '0',
      ...envOverrides,
    });
  }
}
