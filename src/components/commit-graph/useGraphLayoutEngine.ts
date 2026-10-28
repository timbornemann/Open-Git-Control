import { prepareGraphLayout } from '@/data/graphLayout';
import { historyRevision } from '@/data/historyRevision';
import { gitHistoryVersion } from '@/data/gitHistoryRefresh';
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { type GraphLayout } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';
import { mergeCommitStatsUpdate } from './mergeCommitStatsUpdate';

export const useGraphLayoutEngine = (setLayout: Dispatch<SetStateAction<GraphLayout | null>>, repoPath = '', scopeKey = repoPath) => {
  const generation = useRef(0);
  const currentScope = useRef(scopeKey);
  if (currentScope.current !== scopeKey) {
    currentScope.current = scopeKey;
    generation.current++;
  }
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return useCallback(
    async (commits: GitCommit[], previous?: GraphLayout) => {
      if (currentScope.current !== scopeKey) return;
      const request = ++generation.current;
      const revision = historyRevision(repoPath);
      const version = gitHistoryVersion(repoPath);
      const isCurrent = () => generation.current === request && historyRevision(repoPath) === revision && gitHistoryVersion(repoPath) === version;
      try {
        const layout = await prepareGraphLayout(repoPath, commits, previous);
        if (!isCurrent()) return;
        setLayout((current) => {
          if (!isCurrent()) return current;
          if (!current) return layout;
          const currentByHash = new Map(current.nodes.map((node) => [node.commit.hash, node.commit]));
          const nodes = layout.nodes.map((node) => {
            const currentCommit = currentByHash.get(node.commit.hash);
            if (!currentCommit) return node;
            return { ...node, commit: mergeCommitStatsUpdate(node.commit, { stats: currentCommit.stats, state: currentCommit.statsState }) };
          });
          return { ...layout, nodes };
        });
      } catch (error) {
        // The owner handles current failures alongside history-read errors.
        // Results from a previous repository/view no longer own any UI state.
        if (isCurrent()) throw error;
      }
    },
    [repoPath, scopeKey, setLayout],
  );
};
