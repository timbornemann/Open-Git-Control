import type { ElectronGitAPI } from '@/shared/ipc/contracts/git';
import type { FileTimelineChangeDto } from '@/types/gitDtos';
import { demoAncestors, demoCommitAuthor, demoCommitChanges, demoCommitStats, demoFileBlame, demoFileHistory, resolveDemoCommit } from './demoHistory';
import { validDemoTreePath } from './demoDirectories';
import { ok, type DemoRepository } from './demoRepository';
import { getDemoBlob } from './demoBlob';
import { reachableDemoCommits } from './demoBranchRefs';

const fail = (cause: unknown) => ({ success: false as const, error: cause instanceof Error ? cause.message : String(cause) });
/** History reads share the same saved trees as previews and commit diffs. */
export function createDemoHistoryApi(repo: DemoRepository): Partial<ElectronGitAPI> {
  const authorize = (path?: string, file?: string, reference?: string) => {
    if (path && path !== repo.activeRepo) throw new Error('The practice repository changed.');
    if (file !== undefined && !validDemoTreePath(file)) throw new Error('Choose a valid relative practice path.');
    if (reference && !resolveDemoCommit(repo, reference)) throw new Error('The requested practice commit does not exist.');
  };
  const authorizeBlame = (path: string, reference?: string, repoPath?: string, source?: 'unstaged' | 'staged') => {
    authorize(repoPath, path, reference);
    if (source && !['unstaged', 'staged'].includes(source)) throw new Error('Choose a valid practice blame source.');
    const commit = reference ? resolveDemoCommit(repo, reference) : repo.commits[0];
    if (!commit || getDemoBlob(commit.files || {}, path) === undefined) throw new Error('This practice file has no saved commit version for blame.');
    const files = reference ? commit.files || {} : source === 'staged' ? repo.indexFiles : repo.files;
    if (getDemoBlob(files, path) === undefined) throw new Error('The practice file is absent in this source.');
  };
  return {
    getCommitLogPage: async (request) => {
      try {
        authorize(request.repoPath);
        if (!['all', 'head'].includes(request.scope)) throw new Error('Choose all history or the current branch.');
        const commits = request.scope === 'head' ? reachableDemoCommits(repo, [repo.commits[0]?.hash || '']) : reachableDemoCommits(repo);
        const offset = Math.max(0, Math.floor(request.offset || 0)),
          limit = Math.max(1, Math.min(Math.floor(request.limit || 200), 1_000));
        const page = commits.slice(offset, offset + limit);
        return ok({
          raw: repo.log(page),
          hasMore: offset + page.length < commits.length,
          stats: Object.fromEntries(page.map((commit) => [commit.hash, demoCommitStats(repo, commit)])),
          repoPath: repo.activeRepo,
        });
      } catch (cause) {
        return fail(cause);
      }
    },
    requestCommitStats: async (hashes, _priority, repoPath) => {
      try {
        authorize(repoPath);
        const commits = hashes.map((hash) => {
          const commit = resolveDemoCommit(repo, hash);
          if (!commit) throw new Error('The requested practice commit does not exist.');
          return { hash, commit };
        });
        return ok(Object.fromEntries(commits.map(({ hash, commit }) => [hash, { state: 'ready' as const, stats: demoCommitStats(repo, commit) }])));
      } catch (cause) {
        return fail(cause);
      }
    },
    getFileHistory: async (path, reference, limit, repoPath, options) => {
      try {
        authorize(repoPath, path, reference);
        return ok(demoFileHistory(repo, path, reference, limit, options));
      } catch (cause) {
        return fail(cause);
      }
    },
    getFileBlame: async (path, reference, repoPath, source) => {
      try {
        authorizeBlame(path, reference, repoPath, source);
        return ok(demoFileBlame(repo, path, reference, source));
      } catch (cause) {
        return fail(cause);
      }
    },
    getFileBlameRange: async (path, reference, start, count, repoPath, source) => {
      try {
        authorizeBlame(path, reference, repoPath, source);
        if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(count) || count < 1) throw new Error('Choose a valid practice line range.');
        return ok(demoFileBlame(repo, path, reference, source).slice(start - 1, start - 1 + Math.min(count, 2_000)));
      } catch (cause) {
        return fail(cause);
      }
    },
    getFileTimelineData: async (limit, repoPath, reference) => {
      try {
        authorize(repoPath, undefined, reference);
        const statuses: Record<string, FileTimelineChangeDto['status']> = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed' };
        const count = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit!), 1_000)) : 100;
        return ok(
          demoAncestors(repo, reference)
            .slice(0, count)
            .map((commit) => ({
              hash: commit.hash,
              author: demoCommitAuthor(commit),
              date: commit.date,
              subject: commit.subject,
              changes: demoCommitChanges(repo, commit).map((change) => ({
                status: statuses[change.status],
                path: change.path,
                ...(change.previousPath ? { oldPath: change.previousPath } : {}),
              })),
              baselineFiles: Object.keys(commit.files || {}),
            })),
        );
      } catch (cause) {
        return fail(cause);
      }
    },
  };
}
