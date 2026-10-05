import { useCallback, useMemo, type SetStateAction } from 'react';
import type { GitFileBlameLineDto } from '@/types/git';
import type { IpcResult } from '@/types/ipc';
import { BLAME_LOOKAHEAD_COUNT, splitBlamePage } from '@/components/file-details/blamePagination';
import { resourceKey } from './clientCache';
import { useCachedResult, useResourceState } from './resourceHooks';

type BlamePreview = { lines: GitFileBlameLineDto[]; hasMore: boolean };
const empty: BlamePreview = { lines: [], hasMore: false };

export function useBlamePreview(repoPath: string | null, path: string | null, commit?: string, mode?: 'unstaged' | 'staged') {
  const args: unknown[] = [path, commit, 1, BLAME_LOOKAHEAD_COUNT, repoPath];
  if (mode) args.push(mode);
  const first = useCachedResult<IpcResult<GitFileBlameLineDto[]>>(resourceKey('git', 'getFileBlameRange', args));
  const initial = useMemo(() => (first.data?.success ? splitBlamePage(first.data.data) : empty), [first.data]);
  const [preview, setPreview, hasPreview] = useResourceState<BlamePreview>('git', 'blameView', [repoPath, path, commit, mode], initial);
  const setLines = useCallback(
    (action: SetStateAction<GitFileBlameLineDto[]>) => {
      setPreview((old) => ({ ...old, lines: typeof action === 'function' ? action(old.lines) : action }));
    },
    [setPreview],
  );
  const setHasMore = useCallback(
    (hasMore: boolean) => {
      setPreview((old) => ({ ...old, hasMore }));
    },
    [setPreview],
  );
  return { lines: preview.lines, hasMore: preview.hasMore, hasData: hasPreview || first.data !== undefined, setLines, setHasMore };
}
