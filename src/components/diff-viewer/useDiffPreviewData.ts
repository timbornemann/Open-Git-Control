import { useCachedResult } from '@/data/resourceHooks';
import { resourceKey } from '@/data/clientCache';
import { isImmutableGitRead } from '@/data/mutationEffects';
import { queryClient } from '@/data/queryClient';
import type { DiffPreviewDto } from '@/types/gitDtos';
import type { IpcResult } from '@/types/ipc';
import { useLayoutEffect, useMemo, useState } from 'react';
import type { DiffRequest } from '@/types/diff';
import { parseDiff } from '@/utils/diffParser';
import { gitClient } from '@/services/gitClient';
import { MAX_RENDER_CHARS, MAX_RENDER_LINES, looksBinaryByExtension } from './diffViewerConstants';
import type { CatalogTranslateFn } from '@/i18n';

type UseDiffPreviewDataParams = {
  repoPath: string | null;
  request: DiffRequest;
  refreshTrigger?: number;
  t: CatalogTranslateFn;
};

const buildDiffPreviewArgs = (request: DiffRequest): string[] => {
  if (request.source === 'staged') {
    return ['diff', '--cached', '--', request.path];
  }
  if (request.source === 'unstaged') {
    return ['diff', '--', request.path];
  }
  return ['show', '--format=', '--binary', request.commitHash || '', '--', request.path];
};

export const useDiffPreviewData = ({ repoPath, request, refreshTrigger, t }: UseDiffPreviewDataParams) => {
  const { source, path } = request;
  const commitHash = source === 'commit' ? request.commitHash : undefined;
  const args = useMemo(() => buildDiffPreviewArgs({ source, path, commitHash }), [source, path, commitHash]);
  const limits = { maxBytes: MAX_RENDER_CHARS, maxLines: MAX_RENDER_LINES };
  const key = resourceKey('git', 'getDiffPreview', [args, limits, repoPath]);
  // The shared query owns the native read. Removing its last observer aborts
  // that read, while another viewer of the same file can keep using it.
  const query = useCachedResult<IpcResult<DiffPreviewDto>>(key);
  const preview = query.data?.success ? query.data.data : null;
  const refresh = isImmutableGitRead('getDiffPreview', [args]) ? 0 : (refreshTrigger ?? 0);
  const identity = JSON.stringify([repoPath, args, refresh]);
  const [load, setLoad] = useState<{ identity: string; pending: boolean } | null>(null);
  const diffText = preview?.text || '';
  const sourceTruncated = preview?.truncated || false;

  useLayoutEffect(() => {
    let active = true;
    if (!repoPath || !gitClient.isAvailable()) {
      setLoad({ identity, pending: false });
      return;
    }
    setLoad({ identity, pending: true });

    const fetchDiff = async () => {
      try {
        // Mutable previews are stale reads, not forced cancellations. Identical
        // concurrent requests coalesce; full commit hashes reuse immutable data.
        await gitClient.getDiffPreview(args, { maxBytes: MAX_RENDER_CHARS, maxLines: MAX_RENDER_LINES }, repoPath);
      } catch {
        // The shared query exposes read failures and discards cancellations.
        // A replaced read must not leave an error over its successful successor.
      } finally {
        if (active) setLoad({ identity, pending: false });
      }
    };

    void fetchDiff();
    return () => {
      active = false;
    };
  }, [repoPath, args, identity]);

  const currentLoad = load?.identity === identity ? load : null;
  const error = query.error ? query.error.message || t('diffViewer.errors.diffLoadFailed') : null;
  const isLoading = Boolean(repoPath && gitClient.isAvailable() && !preview && !error && (!currentLoad || currentLoad.pending || query.isFetching));
  const confirmedPreview =
    repoPath &&
    gitClient.isAvailable() &&
    currentLoad &&
    !currentLoad.pending &&
    !error &&
    preview &&
    !query.isFetching &&
    !queryClient.getQueryState(key)?.isInvalidated
      ? preview
      : null;

  const looksBinaryByExt = useMemo(() => looksBinaryByExtension(request.path), [request.path]);

  const isBinaryDiff = useMemo(() => {
    if (!diffText) return false;
    // Git emits these markers as complete, unprefixed lines. Matching source
    // lines too would hide text files that merely mention binary diffs.
    return /^(?:Binary files .+ differ|GIT binary patch)\r?$/m.test(diffText);
  }, [diffText]);

  const isTooLarge = useMemo(() => {
    if (!diffText) return false;
    const lineCount = diffText.split('\n').length;
    return sourceTruncated || diffText.length > MAX_RENDER_CHARS || lineCount > MAX_RENDER_LINES;
  }, [diffText, sourceTruncated]);

  const clippedDiffText = useMemo(() => {
    if (!diffText) return '';
    return diffText.slice(0, MAX_RENDER_CHARS).split('\n').slice(0, MAX_RENDER_LINES).join('\n');
  }, [diffText]);

  const parsed = useMemo(() => parseDiff(clippedDiffText), [clippedDiffText]);
  const canRenderText = !isBinaryDiff && !looksBinaryByExt;

  return {
    isLoading,
    error,
    diffText,
    sourceTruncated,
    parsed,
    canRenderText,
    isBinaryDiff,
    looksBinaryByExt,
    isTooLarge,
    hunkCount: parsed.hunks.length,
    confirmedPreview,
  };
};
