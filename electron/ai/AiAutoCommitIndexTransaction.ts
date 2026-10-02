import * as fs from 'fs';
import * as path from 'path';
import type { GitService } from '../GitService';
import { cleanupPrivateTempDir, createPrivateTempDir, writePrivateTempFile } from '../git/PrivateTempFiles';
import { toLiteralPathspec } from '../git/RepositoryPathSafety';
import type { CommitMessage, SnapshotFile } from './aiServiceTypes';
import type { StatusEntry } from './gitStatusSnapshot';
import type { AutoCommitChange, AutoCommitSnapshot, ChangeSource } from './AutoCommitPlanTypes';
import { assertAutoCommitState, readSnapshotChanges } from './AutoCommitSnapshot';
import { rollbackAutoCommitRef } from './AutoCommitRefRecovery';
import { AutoCommitJournal } from './AutoCommitJournal';
import { acquireRealIndexLock, fingerprintIndex, restoreIndexPaths } from './AutoCommitPrivateIndex';
import type { CommitEditGit } from '../git/CommitEditGit';

type EnvironmentGitService = GitService & {
  runCommandAtPathWithEnv?: (repoPath: string, args: string[], envOverrides: NodeJS.ProcessEnv) => Promise<string>;
};

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
  private initialStagedTree = '';
  private initialHeadTree = '';
  private initialHead: string | null = null;
  private initialBranch: string | null = null;
  private exclusiveGit?: CommitEditGit;
  private journal?: AutoCommitJournal;
  private changeMaps: Partial<Record<ChangeSource, Map<string, AutoCommitChange>>> = {};

  constructor(
    gitService: GitService,
    private readonly repoPath: string,
    private readonly beforeCommit?: (privateIndexPath: string, baseTree?: string) => Promise<void>,
    private readonly options: { signoff?: boolean; ensureActive?: () => void; signal?: AbortSignal } = {},
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
    if (!this.supported) throw new Error('AI Auto-Commit requires isolated Git index support.');
    return this.exclusive(() => this.initializeSnapshot(entries));
  }

  private async initializeSnapshot(entries: StatusEntry[]): Promise<void> {
    if (this.initialized) throw new Error('AI index transaction was already initialized.');
    this.options.ensureActive?.();
    await assertAutoCommitState((args) => this.run(args));
    this.expectedHead = await this.readHead();
    this.expectedHeadRef = await this.readHeadRef();
    this.realIndexPath = await this.resolveRealIndexPath();
    this.journal = new AutoCommitJournal(this.realIndexPath);
    if (await this.journal.recover((args) => this.run(args))) {
      throw new Error('Interrupted AI commit recovered. Inspect the repository, then start a new run if needed. No additional commit was created.');
    }
    const realIndexState = await this.readRealIndexState();
    this.expectedRealIndexTree = realIndexState.tree;
    this.expectedRealIndexFingerprint = realIndexState.fingerprint;
    await this.initializePrivateIndex(this.snapshotIndexPath, this.expectedHead);
    this.initialHeadTree = (await this.runWithIndex(this.snapshotIndexPath, ['write-tree'])).trim();
    this.initialStagedTree = realIndexState.tree;
    this.initialHead = this.expectedHead;
    this.initialBranch = this.expectedHeadRef;
    await this.initializePrivateIndex(path.join(this.tempDir, 'staged.index'), this.initialStagedTree);
    await this.initializePrivateIndex(this.snapshotIndexPath, this.initialStagedTree);
    const affectedPaths = this.collectStatusPaths(entries.filter((entry) => entry.y !== ' '));
    if (affectedPaths.length) {
      const pathspecFile = this.writePathspecFile('snapshot.paths', affectedPaths);
      await this.runWithIndex(this.snapshotIndexPath, ['add', '-A', `--pathspec-from-file=${pathspecFile}`, '--pathspec-file-nul']);
    }
    this.snapshotTree = (await this.runWithIndex(this.snapshotIndexPath, ['write-tree'])).trim();
    if (!this.snapshotTree) throw new Error('AI working-tree snapshot could not be created.');
    this.committablePaths = await this.readSnapshotChangedPaths();
    this.nonCommittableSubmodulePaths = await this.readNonCommittableSubmodulePaths(entries);
    this.initialized = true;
    if (
      (await this.readHead()) !== this.expectedHead ||
      (await this.readHeadRef()) !== this.expectedHeadRef ||
      (await this.readRealIndexState()).fingerprint !== this.expectedRealIndexFingerprint
    )
      throw new Error('Repository changed during snapshot capture.');
    this.options.ensureActive?.();
  }

  async getSnapshot(): Promise<AutoCommitSnapshot> {
    if (!this.initialized || !this.snapshotTree) throw new Error('AI snapshot is unavailable.');
    const staged = await readSnapshotChanges((args) => this.run(args), this.initialHeadTree, this.initialStagedTree, 'staged');
    const worktree = await readSnapshotChanges((args) => this.run(args), this.initialStagedTree, this.snapshotTree, 'worktree');
    this.changeMaps = { staged: new Map(staged.map((change) => [change.path, change])), worktree: new Map(worktree.map((change) => [change.path, change])) };
    return {
      head: this.initialHead,
      branch: this.initialBranch,
      headTree: this.initialHeadTree,
      stagedTree: this.initialStagedTree,
      worktreeTree: this.snapshotTree,
      stagedIndexPath: path.join(this.tempDir, 'staged.index'),
      worktreeIndexPath: this.snapshotIndexPath,
      changes: [...staged, ...worktree],
      skippedPaths: [...this.nonCommittableSubmodulePaths].filter(
        (file) => !staged.some((change) => change.path === file) && !worktree.some((change) => change.path === file),
      ),
    };
  }

  isStatusEntryCommittable(entry: StatusEntry): boolean {
    if (!this.supported || !this.committablePaths) return true;
    return this.committablePaths.has(entry.path) || Boolean(entry.originalPath && this.committablePaths.has(entry.originalPath));
  }

  getNonCommittableSubmodulePaths(): string[] {
    return [...this.nonCommittableSubmodulePaths];
  }

  async commit(batchFiles: Array<Pick<SnapshotFile, 'path' | 'originalPath'>>, message: CommitMessage, source: ChangeSource = 'worktree'): Promise<string> {
    if (!this.supported || !this.initialized || !this.snapshotTree || !this.realIndexPath || !this.expectedRealIndexTree) {
      throw new Error('AI index transaction is not initialized.');
    }

    const affectedPaths = this.collectSnapshotPaths(batchFiles);
    if (affectedPaths.length === 0) throw new Error('AI commit batch contains no paths.');

    const batchIndexPath = path.join(this.tempDir, `batch-${Date.now()}-${Math.random().toString(16).slice(2)}.index`);
    const pathspecFile = this.writePathspecFile(`batch-${Date.now()}-${Math.random().toString(16).slice(2)}.paths`, affectedPaths);
    await this.initializePrivateIndex(batchIndexPath, this.expectedHead);
    const baseTree = (await this.runWithIndex(batchIndexPath, ['write-tree'])).trim();
    const changes = batchFiles.map((file) => this.changeMaps[source]?.get(file.path));
    const updates = changes.every((change): change is AutoCommitChange => Boolean(change)) ? changes : undefined;
    if (updates) await this.applySnapshotEntries(batchIndexPath, updates);
    else await this.restorePathsFromTree(batchIndexPath, source === 'staged' ? this.initialStagedTree : this.snapshotTree, affectedPaths, pathspecFile);
    const expectedCommitTree = (await this.runWithIndex(batchIndexPath, ['write-tree'])).trim();
    if (source === 'staged' && expectedCommitTree !== this.initialStagedTree) throw new Error('The staged commit must match the complete original index.');
    if (expectedCommitTree === baseTree) {
      throw new Error('AI commit batch contains no changes that can be committed in the parent repository.');
    }
    await this.beforeCommit?.(batchIndexPath, baseTree);
    return this.exclusive(() => this.publishBatch(batchIndexPath, pathspecFile, affectedPaths, expectedCommitTree, message, updates));
  }

  private async publishBatch(
    batchIndexPath: string,
    pathspecFile: string,
    affectedPaths: string[],
    expectedCommitTree: string,
    message: CommitMessage,
    updates?: AutoCommitChange[],
  ): Promise<string> {
    this.options.ensureActive?.();
    await assertAutoCommitState((args) => this.run(args));

    const currentHead = await this.readHead();
    const currentHeadRef = await this.readHeadRef();
    if (currentHead !== this.expectedHead || currentHeadRef !== this.expectedHeadRef) {
      throw new Error('Repository HEAD changed while AI Auto-Commit was running. No commit was created.');
    }

    const indexLockPath = `${this.realIndexPath!}.lock`;
    acquireRealIndexLock(indexLockPath);
    const targetRef = this.expectedHeadRef || 'HEAD';
    const reflogAction = `open-git-control-ai-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let commitAttempted = false;
    let commitFinalized = false;
    let preserveRecovery = false;
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
      if (updates) await this.applySnapshotEntries(indexLockPath, updates);
      else await this.restorePathsFromTree(indexLockPath, expectedCommitTree, affectedPaths, pathspecFile);
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
      this.options.ensureActive?.();
      this.journal!.prepare({ head: this.expectedHead, ref: this.expectedHeadRef, tree: expectedCommitTree, action: reflogAction });
      commitAttempted = true;
      const args = ['-c', 'core.logAllRefUpdates=true', 'commit', '--cleanup=verbatim', ...(this.options.signoff ? ['--signoff'] : []), '-F', messageFile];
      await this.exclusiveGit!.run(this.repoPath, args, {
        signal: this.options.signal,
        envOverrides: { GIT_INDEX_FILE: batchIndexPath, GIT_REFLOG_ACTION: reflogAction },
      });

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
        fs.renameSync(indexLockPath, this.realIndexPath!);
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
        const rollbackOutcome = await rollbackAutoCommitRef((args) => this.run(args), targetRef, this.expectedHead, reflogAction).catch(
          () => 'unsafe' as const,
        );
        if (rollbackOutcome === 'unsafe') {
          preserveRecovery = true;
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
      if (!preserveRecovery) {
        try {
          this.journal?.clear();
        } catch {
          // The durable commit must still be reported. A leftover journal is
          // recognized on recovery; it prevents any following commit here.
        }
      }
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
        entries.flatMap((entry) =>
          [entry.path, entry.y === 'R' || entry.y === 'C' ? entry.originalPath : undefined].filter(
            (value): value is string => typeof value === 'string' && value.length > 0,
          ),
        ),
      ),
    ];
  }

  private collectSnapshotPaths(files: Array<Pick<SnapshotFile, 'path' | 'originalPath'>>): string[] {
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

  private restorePathsFromTree(index: string, tree: string, paths: string[], file: string): Promise<void> {
    return restoreIndexPaths(
      (target, args) => this.runWithIndex(target, args),
      (name, values) => this.writePathspecFile(name, values),
      index,
      tree,
      paths,
      file,
    );
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

  private fingerprintIndex(index: string): Promise<string> {
    return fingerprintIndex((target, args) => this.runWithIndex(target, args), index);
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

  private async run(args: string[]): Promise<string> {
    if (this.exclusiveGit) return this.exclusiveGit.run(this.repoPath, args, { ignoreAbort: true });
    return this.git.runCommandAtPath(this.repoPath, args);
  }

  private async applySnapshotEntries(index: string, changes: AutoCommitChange[]): Promise<void> {
    // Hashes and paths originate in the immutable Git diff. Deletions go first
    // to handle file/directory replacements. NUL input preserves every pathname.
    const deletions = changes.flatMap((change) => [
      ...(change.status.startsWith('R') && change.originalPath ? [`0 ${'0'.repeat(change.newBlob.length)}\t${change.originalPath}\0`] : []),
      ...(change.newMode === '000000' ? [`0 ${change.newBlob}\t${change.path}\0`] : []),
    ]);
    const additions = changes.filter((change) => change.newMode !== '000000').map((change) => `${change.newMode} ${change.newBlob}\t${change.path}\0`);
    const input = [...deletions, ...additions].join('');
    const envOverrides = { GIT_INDEX_FILE: index, GIT_OPTIONAL_LOCKS: '0' };
    if (this.exclusiveGit) await this.exclusiveGit.input(this.repoPath, ['update-index', '-z', '--index-info'], input, true, envOverrides);
    else
      await this.git.runner.runBuffer(this.repoPath, ['update-index', '-z', '--index-info'], {
        input,
        envOverrides,
        maxBytes: 64 * 1024,
        tooLargeMessage: 'Git index update output exceeded its limit.',
      });
  }

  private async runWithIndex(indexPath: string, args: string[], envOverrides: NodeJS.ProcessEnv = {}): Promise<string> {
    if (!this.git.runCommandAtPathWithEnv) throw new Error('Environment-isolated Git commands are unavailable.');
    const env = {
      GIT_INDEX_FILE: indexPath,
      GIT_OPTIONAL_LOCKS: '0',
      ...envOverrides,
    };
    if (this.exclusiveGit) return this.exclusiveGit.run(this.repoPath, args, { ignoreAbort: true, envOverrides: env });
    return this.git.runCommandAtPathWithEnv(this.repoPath, args, env);
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    return this.git.runner.withExclusiveWrite(this.repoPath, 'AI commit transaction', async (git) => {
      this.exclusiveGit = git;
      try {
        return await work();
      } finally {
        this.exclusiveGit = undefined;
      }
    });
  }
}
