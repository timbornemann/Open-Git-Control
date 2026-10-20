import { computeGraphLayout, type GraphLayoutSeed } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';

self.onmessage = (event: MessageEvent<{ generation: number; commits: GitCommit[]; seed?: GraphLayoutSeed }>) => {
  const { generation, commits, seed } = event.data;
  self.postMessage({
    generation,
    layout: computeGraphLayout(commits, seed),
  });
};

export {};
