import { computeGraphLayoutAsync, type GraphLayout } from '@/utils/graphLayout';
import type { GitCommit } from '@/utils/gitParsing';
import { queryClient } from './queryClient';
import { normalizeRepoPathKey } from '@/utils/repoPath';

let worker: Worker | null = null;
let generation = 0;
type PendingLayout = {
  resolve: (layout: GraphLayout) => void;
  reject: (error: unknown) => void;
  commits: GitCommit[];
  signal: AbortSignal;
  abort: () => void;
  worker: Worker | null;
};
const pending = new Map<number, PendingLayout>();
function complete(id: number, result: { layout: GraphLayout } | { error: unknown }) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  entry.signal.removeEventListener('abort', entry.abort);
  if ('layout' in result) entry.resolve(result.layout);
  else entry.reject(result.error);
}
function fallback(failedWorker: Worker) {
  if (worker !== failedWorker) return;
  failedWorker.terminate();
  worker = null;
  for (const [id, entry] of pending) {
    if (entry.worker !== failedWorker) continue;
    entry.worker = null;
    void computeGraphLayoutAsync(entry.commits, entry.signal).then(
      (layout) => complete(id, { layout }),
      (error) => complete(id, { error }),
    );
  }
}
function calculate(commits: GitCommit[], signal: AbortSignal): Promise<GraphLayout> {
  signal.throwIfAborted();
  if (typeof Worker === 'undefined') return computeGraphLayoutAsync(commits, signal);
  if (!worker) {
    try {
      const created = new Worker(new URL('../workers/graphLayout.worker.ts', import.meta.url), { type: 'module' });
      worker = created;
      created.onmessage = (event: MessageEvent<{ generation: number; layout: GraphLayout }>) => {
        if (pending.get(event.data.generation)?.worker === created) complete(event.data.generation, { layout: event.data.layout });
      };
      created.onerror = (event) => {
        event.preventDefault();
        fallback(created);
      };
      created.onmessageerror = () => fallback(created);
    } catch {
      return computeGraphLayoutAsync(commits, signal);
    }
  }
  const currentWorker = worker;
  const id = ++generation;
  return new Promise((resolve, reject) => {
    const abort = () => {
      complete(id, { error: signal.reason });
      if (worker === currentWorker && ![...pending.values()].some((entry) => entry.worker === currentWorker)) {
        currentWorker.terminate();
        worker = null;
      }
    };
    pending.set(id, { resolve, reject, commits, signal, abort, worker: currentWorker });
    signal.addEventListener('abort', abort, { once: true });
    try {
      currentWorker.postMessage({ generation: id, commits });
    } catch {
      fallback(currentWorker);
    }
  });
}

export function prepareGraphLayout(repoPath: string, commits: GitCommit[]) {
  const signature = commits.map((commit) => [commit.hash, commit.parentHashes, commit.refs, commit.stats, commit.statsState]);
  return queryClient.fetchQuery({
    queryKey: ['resource', 'git', normalizeRepoPathKey(repoPath), 'layout', signature],
    staleTime: Infinity,
    queryFn: ({ signal }) => calculate(commits, signal),
  });
}
