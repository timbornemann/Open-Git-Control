import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { computeGraphLayout, type GraphLayout } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';
import { mergeCommitStatsUpdate } from './mergeCommitStatsUpdate';

export const useGraphLayoutEngine = (setLayout: Dispatch<SetStateAction<GraphLayout | null>>) => {
  const layoutGenerationRef = useRef(0);
  const layoutWorkerRef = useRef<Worker | null>(null);

  const updateLayout = useCallback(
    (commits: GitCommit[]) => {
      const generation = ++layoutGenerationRef.current;
      const worker = layoutWorkerRef.current;
      if (worker) {
        worker.postMessage({ generation, commits });
        return;
      }
      setLayout(computeGraphLayout(commits));
    },
    [setLayout],
  );

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const worker = new Worker(new URL('../../workers/graphLayout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ generation: number; layout: GraphLayout }>) => {
      if (event.data.generation !== layoutGenerationRef.current) return;
      setLayout((current) => {
        if (!current) return event.data.layout;
        const currentByHash = new Map(current.nodes.map((node) => [node.commit.hash, node.commit]));
        let changed = false;
        const nodes = event.data.layout.nodes.map((node) => {
          const currentCommit = currentByHash.get(node.commit.hash);
          if (!currentCommit) return node;
          const commit = mergeCommitStatsUpdate(node.commit, {
            stats: currentCommit.stats,
            state: currentCommit.statsState,
          });
          if (commit === node.commit) return node;
          changed = true;
          return { ...node, commit };
        });
        return changed ? { ...event.data.layout, nodes } : event.data.layout;
      });
    };
    layoutWorkerRef.current = worker;
    return () => {
      worker.terminate();
      layoutWorkerRef.current = null;
    };
  }, [setLayout]);

  return updateLayout;
};
