import { gitClient } from '@/services/gitClient';
import { parseCommitDetails, type CommitFileDetail } from '@/utils/gitParsing';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { readResource } from './queryClient';
import { currentReadPriority, withReadPriority } from './clientCache';

export type CommitOverview = { files: CommitFileDetail[]; description: string; isMergeCommit: boolean; filesFromMerge: boolean };
export const EMPTY_COMMIT_OVERVIEW: CommitOverview = { files: [], description: '', isMergeCommit: false, filesFromMerge: false };
export function loadCommitOverview(repo: string, hash: string) {
  const priority = currentReadPriority();
  return readResource(
    ['resource', 'git', normalizeRepoPathKey(repo), 'commitOverview', hash],
    async () => {
      const [parents, message, details] = await withReadPriority(
        () =>
          Promise.all([
            gitClient.runGitCommandForRepo(repo, 'show', '-s', '--format=%P', hash),
            gitClient.runGitCommandForRepo(repo, 'show', '-s', '--format=%B', hash),
            gitClient.runGitCommandForRepo(repo, 'commitDetails', hash),
          ]),
        priority,
      );
      if (!details.success) return details;
      const isMergeCommit = parents.success && parents.data.trim().split(/\s+/).filter(Boolean).length > 1;
      let files = parseCommitDetails(details.data || '');
      let filesFromMerge = false;
      if (!files.length && isMergeCommit) {
        const merge = await withReadPriority(() => gitClient.runGitCommandForRepo(repo, 'diff', '--name-status', '-M', '-z', `${hash}^1`, hash), priority);
        if (merge.success) {
          files = parseCommitDetails(merge.data || '');
          filesFromMerge = files.length > 0;
        }
      }
      return {
        success: true as const,
        data: {
          files,
          isMergeCommit,
          filesFromMerge,
          description: message.success ? message.data.replace(/\r\n/g, '\n').split('\n').slice(1).join('\n').trim() : '',
        },
      };
    },
    { staleTime: Infinity, scheduled: false, priority },
  );
}
