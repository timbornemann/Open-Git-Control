import { computeGraphLayout } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';

self.onmessage = (event: MessageEvent<{ generation: number; commits: GitCommit[] }>) => {
  const { generation, commits } = event.data;
  self.postMessage({
    generation,
    layout: computeGraphLayout(commits),
  });
};

export {};
