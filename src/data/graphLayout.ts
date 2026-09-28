import { computeGraphLayout, type GraphLayout } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';
import { queryClient } from './queryClient';
import { normalizeRepoPathKey } from '@/utils/repoPath';

let worker: Worker | null = null;
let generation = 0;
const pending = new Map<number, { resolve: (layout: GraphLayout) => void; commits: GitCommit[] }>();
function calculate(commits: GitCommit[]): Promise<GraphLayout> {
  if (typeof Worker === 'undefined') return Promise.resolve(computeGraphLayout(commits));
  if (!worker) {
    worker = new Worker(new URL('../workers/graphLayout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ generation: number; layout: GraphLayout }>) => {
      pending.get(event.data.generation)?.resolve(event.data.layout);
      pending.delete(event.data.generation);
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      for (const entry of pending.values()) entry.resolve(computeGraphLayout(entry.commits));
      pending.clear();
    };
  }
  const id = ++generation;
  return new Promise((resolve) => {
    pending.set(id, { resolve, commits });
    worker!.postMessage({ generation: id, commits });
  });
}

export function prepareGraphLayout(repoPath: string, commits: GitCommit[]) {
  const signature = commits.map((commit) => [commit.hash, commit.parentHashes, commit.refs, commit.stats, commit.statsState]);
  return queryClient.fetchQuery({
    queryKey: ['resource', 'git', normalizeRepoPathKey(repoPath), 'layout', signature],
    staleTime: Infinity,
    queryFn: () => calculate(commits),
  });
}
