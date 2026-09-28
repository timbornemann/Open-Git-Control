import { prepareGraphLayout } from '@/data/graphLayout';
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { type GraphLayout } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';
import { mergeCommitStatsUpdate } from './mergeCommitStatsUpdate';

export const useGraphLayoutEngine = (setLayout: Dispatch<SetStateAction<GraphLayout | null>>, repoPath = '') => {
  const generation = useRef(0);
  const currentRepo = useRef(repoPath);
  if (currentRepo.current !== repoPath) {
    currentRepo.current = repoPath;
    generation.current++;
  }
  useEffect(
    () => () => {
      generation.current++;
    },
    [repoPath],
  );
  return useCallback(
    (commits: GitCommit[]) => {
      const request = ++generation.current;
      void prepareGraphLayout(repoPath, commits).then((layout) => {
        if (generation.current !== request) return;
        setLayout((current) => {
          if (!current) return layout;
          const currentByHash = new Map(current.nodes.map((node) => [node.commit.hash, node.commit]));
          const nodes = layout.nodes.map((node) => {
            const currentCommit = currentByHash.get(node.commit.hash);
            if (!currentCommit) return node;
            return { ...node, commit: mergeCommitStatsUpdate(node.commit, { stats: currentCommit.stats, state: currentCommit.statsState }) };
          });
          return { ...layout, nodes };
        });
      });
    },
    [repoPath, setLayout],
  );
};
