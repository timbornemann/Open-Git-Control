import type { ElectronGitAPI } from '@/shared/ipc/contracts/git';
import type { CommitMessageEditPhase, RewordCommitMessageRequest } from '@/shared/ipc/commitMessageEdit';
import type { GitJobEventDto } from '@/types/aiDtos';
import { DEMO_TIME, type DemoRepository } from './demoRepository';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { inspectDemoMessageEdit } from './demoCommitMessageInspection';
import { recordDemoHead } from './demoReflog';
const failure = (cause: unknown) => ({ success: false as const, error: cause instanceof Error ? cause.message : String(cause) });
const validId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
type Operation = { cancelled: boolean; published: boolean };
/** All publication checks and rewrites stay within the current example project. */
export function createDemoCommitMessageEditApi(repo: DemoRepository): Partial<ElectronGitAPI> {
  const operations = new Map<string, Operation>(),
    used = new Set<string>();
  let writing = false;
  let eventNumber = 0;
  const emit = (id: string, status: GitJobEventDto['status'], message: string) =>
    repo.emitChannel('jobs', {
      id,
      eventId: crypto.randomUUID(),
      operation: 'commit-message-edit',
      status,
      message,
      timestamp: DEMO_TIME + eventNumber++,
    } satisfies GitJobEventDto);
  const authorize = (path: string) => {
    if (path !== repo.activeRepo) throw new Error('The practice repository changed.');
  };
  const inspect = (input: { repoPath: string; commitHash: string }) => {
    authorize(input.repoPath);
    return inspectDemoMessageEdit(repo, input.commitHash);
  };
  const validate = (input: RewordCommitMessageRequest) => {
    if (
      !validId.test(input.operationId) ||
      typeof input.expectedBranch !== 'string' ||
      !input.expectedBranch.startsWith('refs/heads/') ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.expectedHead)
    )
      throw new Error('Invalid practice message edit request.');
    if (
      typeof input.title !== 'string' ||
      typeof input.description !== 'string' ||
      !input.title.trim() ||
      /[\r\n\0]/.test(input.title) ||
      input.description.includes('\0')
    )
      throw new Error('A single-line title and a valid description are required.');
    const title = input.title.trim(),
      description = input.description.replace(/\r\n/g, '\n');
    if (new TextEncoder().encode(title + (description ? '\n\n' + description : '') + '\n').byteLength > 100_000) throw new Error('Commit message is too long.');
    return { title, description };
  };
  return {
    inspectCommitMessageEdit: async (input) => {
      try {
        return { success: true, data: structuredClone(inspect(input).inspection) };
      } catch (cause) {
        return failure(cause);
      }
    },
    getCommitMessageEditBackups: async (path) => {
      try {
        authorize(path);
        return { success: true, data: structuredClone(repo.messageEditBackups) };
      } catch (cause) {
        return failure(cause);
      }
    },
    onJobEvent: (callback) =>
      repo.subscribeChannel('jobs', (event) => {
        try {
          callback(event as GitJobEventDto);
        } catch {
          /* Observer failures cannot undo a published result. */
        }
      }),
    cancelCommitMessageEdit: async (id) => {
      const operation = operations.get(id);
      if (!operation || operation.published) return false;
      operation.cancelled = true;
      return true;
    },
    rewordCommitMessage: async (input) => {
      let operation: Operation | undefined;
      try {
        const message = validate(input);
        if (writing || used.has(input.operationId)) throw new Error('A practice message edit is already active or this operation ID was used.');
        const snapshot = inspect(input),
          info = snapshot.inspection;
        if (info.blockReason) throw new Error(info.blockDetail);
        if (info.expectedHead !== input.expectedHead || info.expectedBranch !== input.expectedBranch)
          throw new Error('The branch or HEAD changed. Close and reopen the commit editor.');
        if (info.title === message.title && info.description === message.description)
          return { success: true, data: { changed: false, oldHead: info.expectedHead, newHead: info.expectedHead, hashMapping: {}, backupRef: null } };
        const fingerprint = demoRepositoryFingerprint(repo),
          context = repo.contextVersion;
        operation = { cancelled: false, published: false };
        operations.set(input.operationId, operation);
        used.add(input.operationId);
        writing = true;
        emit(input.operationId, 'start', 'checking');
        const current = operation;
        const ensure = () => {
          if (current.cancelled) throw new Error('The practice message edit was cancelled.');
          authorize(input.repoPath);
          if (context !== repo.contextVersion || fingerprint !== demoRepositoryFingerprint(repo))
            throw new Error('The practice repository changed during message editing.');
        };
        const phases: CommitMessageEditPhase[] = ['checking', 'remotes', 'rewriting', 'verifying', 'remotes'];
        for (const phase of phases) {
          emit(input.operationId, 'progress', phase);
          await Promise.resolve();
          ensure();
        }
        const plan = repo.commitSequence.plan(repo.commits, snapshot.commits.length),
          mapping: Record<string, string> = {};
        const rewritten = snapshot.commits.map((commit, index) => {
          const hash = plan.hashes[index];
          mapping[commit.hash] = hash;
          return {
            ...structuredClone(commit),
            hash,
            parent: index ? plan.hashes[index - 1] : commit.parent,
            ...(index === 0 ? { subject: message.title, body: message.description } : {}),
          };
        });
        const newHead = rewritten.at(-1)!;
        const backupRef = 'refs/ogc/commit-reword/' + input.operationId;
        const nextHeadFiles = structuredClone(newHead.files!);
        const backups = [
          { ref: backupRef, hash: info.expectedHead, branch: info.expectedBranch, createdAt: DEMO_TIME + repo.revision },
          ...repo.messageEditBackups,
        ];
        ensure();
        emit(input.operationId, 'progress', 'publishing');
        ensure();
        repo.commitSequence.publish(plan);
        current.published = true;
        repo.commits = [...rewritten.reverse(), ...repo.commits];
        repo.branchHeads.set(repo.branch, newHead.hash);
        repo.headFiles = nextHeadFiles;
        repo.messageEditBackups = backups;
        recordDemoHead(repo, 'Open Git Control: edit commit message');
        try {
          repo.mark('commit-message-edited');
        } catch {
          /* The client refreshes the committed result independently. */
        }
        emit(input.operationId, 'done', 'cleanup');
        return { success: true, data: { changed: true, oldHead: info.expectedHead, newHead: newHead.hash, hashMapping: mapping, backupRef } };
      } catch (cause) {
        const cancelled = Boolean(operation?.cancelled);
        if (operation) emit(input.operationId, cancelled ? 'cancelled' : 'failed', cause instanceof Error ? cause.message : String(cause));
        return { ...failure(cause), ...(cancelled ? { cancelled: true } : {}) };
      } finally {
        if (operation) {
          operations.delete(input.operationId);
          writing = false;
        }
      }
    },
  };
}
