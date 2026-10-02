import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import type { GitRunner } from './GitRunner';
import type {
  CommitMessageEditBackup,
  CommitMessageEditInspection,
  CommitMessageEditPhase,
  CommitMessageEditResult,
  RewordCommitMessageRequest,
} from '../../src/shared/ipc/commitMessageEdit';
import { BACKUP_PREFIX, CommitEditBlockedError, inspectSnapshot, OBJECT_ID, readCommit, splitMessage } from './commitMessageEditInspection';
import {
  backupReference,
  cleanupEditWorkspace,
  createEditWorkspace,
  EDIT_ID,
  journalDirectory,
  readJournals,
  writeJournal,
  type EditJournal,
} from './commitMessageEditJournal';
import { verifyUnpublished } from './commitMessageEditRemotes';
import { prepareRewrite, verifyRewrite } from './commitMessageEditRewrite';
import { repositoryCommonDirectory } from './RepositoryCommonDirectory';
import { publishRewrite } from './commitMessageEditPublication';

type RunContext = { signal: AbortSignal; ensureActive: () => void; progress: (phase: CommitMessageEditPhase) => void };

export class CommitMessageEditService {
  constructor(
    private readonly runner: GitRunner,
    private readonly remoteTimeoutMs = 60_000,
  ) {}

  async inspect(repoPath: string, commitHash: string): Promise<CommitMessageEditInspection> {
    if (!OBJECT_ID.test(commitHash)) throw new Error('Invalid full commit hash.');
    await this.recover(repoPath);
    return this.runner.withExclusiveWrite(repoPath, 'inspect-commit-message', async (git) => {
      const commit = await readCommit(git, repoPath, commitHash);
      const result: CommitMessageEditInspection = {
        commitHash,
        ...splitMessage(commit.message),
        expectedHead: '',
        expectedBranch: '',
        commitCount: 0,
        signedCommitCount: 0,
        blockReason: null,
        blockDetail: '',
      };
      try {
        await this.checkGitVersion(git.run.bind(git), repoPath);
        const snapshot = await inspectSnapshot(git, repoPath, commitHash);
        return {
          ...result,
          expectedHead: snapshot.head,
          expectedBranch: snapshot.branch,
          commitCount: snapshot.commits.length,
          signedCommitCount: snapshot.commits.filter((entry) => entry.signed).length,
        };
      } catch (error) {
        if (!(error instanceof CommitEditBlockedError)) throw error;
        return { ...result, blockReason: error.reason, blockDetail: error.message };
      }
    });
  }

  async reword(input: RewordCommitMessageRequest, context: RunContext): Promise<CommitMessageEditResult> {
    if (
      !OBJECT_ID.test(input.commitHash) ||
      !OBJECT_ID.test(input.expectedHead) ||
      typeof input.expectedBranch !== 'string' ||
      !input.expectedBranch.startsWith('refs/heads/') ||
      !EDIT_ID.test(input.operationId)
    ) {
      throw new Error('Invalid commit message edit request.');
    }
    if (
      typeof input.title !== 'string' ||
      typeof input.description !== 'string' ||
      !input.title.trim() ||
      /[\r\n\0]/.test(input.title) ||
      input.description.includes('\0')
    ) {
      throw new Error('A single-line commit title and a valid description are required.');
    }
    const title = input.title.trim();
    const description = input.description.replace(/\r\n/g, '\n');
    const message = `${title}${description ? `\n\n${description}` : ''}\n`;
    if (Buffer.byteLength(message, 'utf8') > 100_000) throw new Error('Commit message is too long.');
    await this.recover(input.repoPath);
    return this.runner.withExclusiveWrite(
      input.repoPath,
      'reword-commit-message',
      async (git) => {
        context.ensureActive();
        context.progress('checking');
        await this.checkGitVersion(git.run.bind(git), input.repoPath);
        const snapshot = await inspectSnapshot(git, input.repoPath, input.commitHash);
        if (snapshot.head !== input.expectedHead || snapshot.branch !== input.expectedBranch)
          throw new Error('The branch or HEAD changed. Close and reopen the commit editor.');
        const original = splitMessage(snapshot.commits[0].message);
        if (title === original.title && description === original.description) {
          return { changed: false, oldHead: snapshot.head, newHead: snapshot.head, hashMapping: {}, backupRef: null };
        }
        const journal: EditJournal = {
          version: 1,
          id: randomUUID(),
          repoPath: input.repoPath,
          commonDir: snapshot.commonDir,
          gitDir: snapshot.gitDir,
          branch: snapshot.branch,
          oldHead: snapshot.head,
          createdAt: Date.now(),
          state: 'preparing',
        };
        createEditWorkspace(journal);
        let completed: CommitMessageEditResult | null = null;
        try {
          context.progress('remotes');
          await verifyUnpublished(git, input.repoPath, input.commitHash, journal.id, context.signal, this.remoteTimeoutMs);
          context.ensureActive();
          context.progress('rewriting');
          const { worktree, newHead } = await prepareRewrite(git, input.repoPath, snapshot, journal, message);
          context.progress('verifying');
          const mapping = await verifyRewrite(git, worktree, snapshot.commits, newHead, message);
          // Recheck publication after the potentially slow hook/signing phase.
          context.progress('remotes');
          await verifyUnpublished(git, input.repoPath, input.commitHash, journal.id, context.signal, this.remoteTimeoutMs);
          journal.newHead = newHead;
          const backupRef = backupReference(journal);
          context.ensureActive();
          context.progress('publishing');
          await publishRewrite(git, input.repoPath, worktree, snapshot, journal, context.ensureActive);
          completed = { changed: true, oldHead: snapshot.head, newHead, hashMapping: mapping, backupRef };
          journal.state = 'published';
          try {
            writeJournal(journal);
          } catch {
            /* The atomic backup also records successful publication. */
          }
          return completed;
        } finally {
          context.progress('cleanup');
          try {
            await cleanupEditWorkspace(git, input.repoPath, journal);
          } catch {
            // Keep the original operation outcome and the journal for recovery.
            // A cleanup failure cannot turn an already published edit into a
            // reported failure or mask the reason the preparation was rejected.
          }
        }
      },
      context.signal,
    );
  }

  async recover(repoPath: string) {
    const commonDir = repositoryCommonDirectory(repoPath);
    if (!commonDir || !fs.existsSync(journalDirectory(commonDir))) return;
    const pending = readJournals(commonDir).filter((journal) => journal.state !== 'cleaned');
    if (!pending.length) return;
    await this.runner.withExclusiveWrite(repoPath, 'recover-commit-message-edit', async (git) => {
      for (const journal of readJournals(commonDir).filter((entry) => entry.state !== 'cleaned')) {
        // Never repeat a ref update on restart. The backup is created atomically
        // with publication, so it also identifies a completed interrupted job.
        const published = await git.run(repoPath, ['rev-parse', '--verify', backupReference(journal)]).catch(() => '');
        if (published === journal.oldHead) journal.state = 'published';
        await cleanupEditWorkspace(git, repoPath, journal);
      }
    });
  }

  async backups(repoPath: string): Promise<CommitMessageEditBackup[]> {
    await this.recover(repoPath);
    const commonDir = repositoryCommonDirectory(repoPath);
    if (!commonDir) return [];
    const journals = new Map(readJournals(commonDir).map((journal) => [backupReference(journal), journal]));
    const output = await this.runner.run(repoPath, ['for-each-ref', '--format=%(refname) %(objectname)', BACKUP_PREFIX]);
    return output
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        const [ref, hash] = line.split(' ');
        const journal = journals.get(ref);
        return journal && OBJECT_ID.test(hash) ? [{ ref, hash, branch: journal.branch, createdAt: journal.createdAt }] : [];
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private async checkGitVersion(run: (repo: string, args: string[]) => Promise<string>, repo: string) {
    const version = (await run(repo, ['--version'])).match(/git version (\d+)\.(\d+)/);
    if (!version || Number(version[1]) < 2 || (Number(version[1]) === 2 && Number(version[2]) < 48)) {
      throw new CommitEditBlockedError('incomplete', 'Editing commit messages safely requires Git 2.48 or newer.');
    }
  }
}
