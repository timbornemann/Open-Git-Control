import type { GitCommit } from '@/utils/gitParsing';

export const mergeQuickRefreshCommits = (existing: GitCommit[], refreshedHead: GitCommit[]): GitCommit[] => {
  const existingIndexByHash = new Map(existing.map((commit, index) => [commit.hash, index]));
  let overlapIndex = -1;

  for (let index = refreshedHead.length - 1; index >= 0; index -= 1) {
    const existingIndex = existingIndexByHash.get(refreshedHead[index].hash);
    if (typeof existingIndex === 'number') {
      overlapIndex = existingIndex;
      break;
    }
  }

  const candidates = overlapIndex >= 0 ? [...refreshedHead, ...existing.slice(overlapIndex + 1)] : refreshedHead;
  const seen = new Set<string>();

  return candidates.filter((commit) => {
    if (seen.has(commit.hash)) return false;
    seen.add(commit.hash);
    return true;
  });
};
