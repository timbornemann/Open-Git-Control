import { useEffect, useRef, useState } from 'react';
import { freshRead } from '@/data/clientCache';
import { useResourceState } from '@/data/resourceHooks';
import { gitClient } from '@/services/gitClient';
import type { GitFileHistoryEntryDto } from '@/types/git';

export const FILE_HISTORY_PAGE_SIZE = 80;
const options = { includeFuture: true } as const;
type State = { identity: string; entries: GitFileHistoryEntryDto[]; loading: boolean; error: string | null; hasMore: boolean };

export function useCommitFileHistory(repoPath: string | null, path: string | undefined, commitHash: string, active: boolean, refreshTrigger: number) {
  const identity = JSON.stringify([repoPath, path, commitHash]);
  const [cached, , hasCache] = useResourceState<GitFileHistoryEntryDto[]>(
    'git',
    'getFileHistory',
    [path, commitHash, FILE_HISTORY_PAGE_SIZE + 1, repoPath, options],
    [],
  );
  const cachedRef = useRef({ cached, hasCache });
  cachedRef.current = { cached, hasCache };
  const generationRef = useRef(Symbol());
  const loadingRef = useRef(false);
  const refreshRef = useRef(refreshTrigger);
  const acceptedCacheRef = useRef<{ identity: string; entries: GitFileHistoryEntryDto[] }>();
  const [state, setState] = useState<State>({ identity: '', entries: [], loading: false, error: null, hasMore: false });
  const current =
    state.identity === identity
      ? state
      : {
          identity,
          entries: cached.slice(0, FILE_HISTORY_PAGE_SIZE),
          loading: active && !hasCache,
          error: null,
          hasMore: cached.length > FILE_HISTORY_PAGE_SIZE,
        };

  useEffect(() => {
    if (!hasCache || (acceptedCacheRef.current?.identity === identity && acceptedCacheRef.current.entries === cached)) return;
    acceptedCacheRef.current = { identity, entries: cached };
    generationRef.current = Symbol();
    loadingRef.current = false;
    setState({ identity, entries: cached.slice(0, FILE_HISTORY_PAGE_SIZE), hasMore: cached.length > FILE_HISTORY_PAGE_SIZE, loading: false, error: null });
  }, [cached, hasCache, identity]);

  useEffect(() => {
    const generation = Symbol();
    generationRef.current = generation;
    loadingRef.current = false;
    if (!active || !path || !repoPath || !gitClient.isAvailable()) return;
    loadingRef.current = true;
    setState((previous) => ({
      ...(previous.identity === identity
        ? previous
        : {
            identity,
            entries: cachedRef.current.cached.slice(0, FILE_HISTORY_PAGE_SIZE),
            hasMore: cachedRef.current.cached.length > FILE_HISTORY_PAGE_SIZE,
          }),
      loading: true,
      error: null,
    }));
    const read = () => gitClient.getFileHistory(path, commitHash, FILE_HISTORY_PAGE_SIZE + 1, repoPath, options);
    const pending = refreshRef.current === refreshTrigger ? read() : freshRead(read);
    refreshRef.current = refreshTrigger;
    void pending
      .then((result) => {
        if (generation !== generationRef.current) return;
        if (result.success)
          setState({
            identity,
            entries: result.data.slice(0, FILE_HISTORY_PAGE_SIZE),
            hasMore: result.data.length > FILE_HISTORY_PAGE_SIZE,
            loading: false,
            error: null,
          });
        else setState((previous) => ({ ...previous, loading: false, error: result.error }));
      })
      .catch((error: unknown) => {
        if (generation === generationRef.current)
          setState((previous) => ({ ...previous, loading: false, error: error instanceof Error ? error.message : String(error) }));
      })
      .finally(() => {
        if (generation === generationRef.current) loadingRef.current = false;
      });
    return () => {
      generationRef.current = Symbol();
      loadingRef.current = false;
    };
  }, [active, commitHash, identity, path, refreshTrigger, repoPath]);

  const loadMore = async () => {
    const latest = current.entries[0];
    if (!repoPath || !path || !latest || !current.hasMore || loadingRef.current) return;
    const generation = generationRef.current;
    loadingRef.current = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      // Pin later pages to the newest displayed change. New commits arriving
      // between pages cannot shift offsets or duplicate/skip history entries.
      const result = await gitClient.getFileHistory(latest.path || path, latest.hash, FILE_HISTORY_PAGE_SIZE + 1, repoPath, { offset: current.entries.length });
      if (generation !== generationRef.current) return;
      if (result.success)
        setState((previous) => ({
          ...previous,
          entries: [...previous.entries, ...result.data.slice(0, FILE_HISTORY_PAGE_SIZE)],
          hasMore: result.data.length > FILE_HISTORY_PAGE_SIZE,
          loading: false,
        }));
      else setState((previous) => ({ ...previous, loading: false, error: result.error }));
    } catch (error) {
      if (generation === generationRef.current)
        setState((previous) => ({ ...previous, loading: false, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      if (generation === generationRef.current) loadingRef.current = false;
    }
  };
  return { ...current, loadMore };
}
