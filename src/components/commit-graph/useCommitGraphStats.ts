import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { historyRevision } from '@/data/historyRevision';
import { gitClient } from '@/services/gitClient';
import type { GraphLayout } from '@/utils/graphLayout';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { mergeCommitStatsUpdate, mergePendingCommitStatsUpdate, type CommitStatsUpdate } from './mergeCommitStatsUpdate';

export const COMMIT_STATS_BATCH_MS = 50;

type Params = {
  repoPath: string | null;
  scopeKey: string;
  revision: number;
  loadedCommitHashes: string;
  setLayout: Dispatch<SetStateAction<GraphLayout | null>>;
};

const applyStats = (layout: GraphLayout, updates: Map<string, CommitStatsUpdate>): GraphLayout => {
  let changed = false;
  const nodes = layout.nodes.map((node) => {
    const update = updates.get(node.commit.hash);
    if (!update) return node;
    const commit = mergeCommitStatsUpdate(node.commit, update);
    if (commit === node.commit) return node;
    changed = true;
    return { ...node, commit };
  });
  return changed ? { ...layout, nodes } : layout;
};

export function useCommitGraphStats({ repoPath, scopeKey, revision, loadedCommitHashes, setLayout }: Params) {
  const scope = useMemo(
    () => ({
      key: scopeKey,
      revision,
      repoPath,
      active: false,
      timer: null as ReturnType<typeof setTimeout> | null,
      latest: new Map<string, CommitStatsUpdate>(),
      pending: new Map<string, CommitStatsUpdate>(),
    }),
    [scopeKey, revision, repoPath],
  );
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const isCurrent = useCallback(() => currentScope.current === scope && scope.active && historyRevision(scope.repoPath || '') === scope.revision, [scope]);

  useLayoutEffect(() => {
    scope.active = true;
    return () => {
      scope.active = false;
      if (scope.timer !== null) clearTimeout(scope.timer);
      scope.timer = null;
      scope.latest.clear();
      scope.pending.clear();
    };
  }, [scope]);

  const schedule = useCallback(() => {
    if (!isCurrent() || scope.timer !== null || !scope.pending.size) return;
    scope.timer = setTimeout(() => {
      scope.timer = null;
      if (!isCurrent()) return;
      const batch = new Map(scope.pending);
      scope.pending.clear();
      // Cache publication belongs to the owner's committed-layout effect.
      // Keep React state updaters pure, including during Strict Mode replay.
      setLayout((layout) => (layout && isCurrent() ? applyStats(layout, batch) : layout));
    }, COMMIT_STATS_BATCH_MS);
  }, [isCurrent, scope, setLayout]);

  const enqueue = useCallback(
    (updates: Iterable<[string, CommitStatsUpdate]>) => {
      if (!isCurrent()) return;
      for (const [hash, update] of updates) {
        const previous = scope.latest.get(hash);
        const next = previous ? mergePendingCommitStatsUpdate(previous, update) : update;
        if (next === previous) continue;
        scope.latest.set(hash, next);
        scope.pending.set(hash, next);
      }
      schedule();
    },
    [isCurrent, schedule, scope],
  );

  useEffect(() => {
    if (!loadedCommitHashes || !isCurrent()) return;
    // Results can arrive before their initial/append worker layout. Replay
    // them when those hashes appear, without re-running layout computation.
    for (const entry of scope.latest) scope.pending.set(...entry);
    schedule();
  }, [loadedCommitHashes, isCurrent, schedule, scope]);

  const requestCommitStats = useCallback(
    async (hashes: string[], priority: 'selected' | 'visible' | 'background' = 'background') => {
      if (!repoPath || !hashes.length || !isCurrent()) return;
      const result = await gitClient.requestCommitStats([...new Set(hashes)].slice(0, 500), priority, repoPath);
      if (result.success && isCurrent()) enqueue(Object.entries(result.data).map(([hash, value]) => [hash, { stats: value.stats, state: value.state }]));
    },
    [enqueue, isCurrent, repoPath],
  );

  useEffect(() => {
    if (!repoPath) return;
    return gitClient.onCommitStats((update) => {
      if (normalizeRepoPathKey(update.repoPath) === normalizeRepoPathKey(repoPath)) enqueue([[update.hash, { stats: update.stats, state: update.state }]]);
    });
  }, [enqueue, repoPath]);

  return requestCommitStats;
}
