import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { useUIContext } from '@/contexts/AppStateContext';
import { useAppToast } from '@/hooks/useAppToast';
import type { DiffRequest } from '@/types/diff';
import type { DiffViewMode, ParsedHunk } from '@/utils/diffParser';
import { DiffContentPane } from '@/components/diff-viewer/DiffContentPane';
import { DiffToolbar } from '@/components/diff-viewer/DiffToolbar';
import { useDiffBlame } from '@/components/diff-viewer/useDiffBlame';
import { useDiffPreviewData } from '@/components/diff-viewer/useDiffPreviewData';
import { useHunkPatchActions } from '@/components/diff-viewer/useHunkPatchActions';
import type { RepositoryFileContextDto } from '@/shared/ipc/repositoryFiles';
import { fileViewerIdentity } from './fileViewerRequest';

type Props = { context: RepositoryFileContextDto; refreshTrigger: number; onRepoChanged?: () => void; onNavigateToCommit?: (hash: string) => void };
export function FileViewerDiff({ context, refreshTrigger, onRepoChanged, onNavigateToCommit }: Props) {
  const { t, tr } = useI18n();
  const { setConfirmDialog } = useUIContext();
  const showToast = useAppToast();
  const { repoPath, path, source, commitHash } = context;
  const request = useMemo<DiffRequest>(() => ({ path, source, commitHash }), [path, source, commitHash]);
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
  const [activeHunkIndex, setActiveHunkIndex] = useState(0);
  const [localRefresh, setLocalRefresh] = useState(0);
  const hunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scope = fileViewerIdentity(context);
  const currentScope = useMemo(() => ({ scope }), [scope]);
  const scopeRef = useRef<typeof currentScope | null>(currentScope);
  scopeRef.current = currentScope;
  const data = useDiffPreviewData({ repoPath, request, refreshTrigger: refreshTrigger + localRefresh, t });
  const blame = useDiffBlame({ repoPath, request, refreshTrigger: refreshTrigger + localRefresh });
  const reportError = useCallback((message: string) => showToast(message, true), [showToast]);
  const applied = useCallback(() => setLocalRefresh((value) => value + 1), []);
  const { isHunkOperationRunning, applyHunk } = useHunkPatchActions({ repoPath, request, onRepoChanged, onApplied: applied, onError: reportError, t });
  useEffect(() => {
    setActiveHunkIndex(0);
    hunkRefs.current = [];
  }, [scope, refreshTrigger, localRefresh]);
  useLayoutEffect(() => {
    scopeRef.current = currentScope;
    return () => {
      if (scopeRef.current === currentScope) scopeRef.current = null;
    };
  }, [currentScope]);
  const scrollToHunk = useCallback(
    (index: number) => {
      if (!data.hunkCount) return;
      const next = Math.max(0, Math.min(index, data.hunkCount - 1));
      setActiveHunkIndex(next);
      hunkRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [data.hunkCount],
  );
  const setHunkRef = useCallback((index: number, element: HTMLDivElement | null) => {
    hunkRefs.current[index] = element;
  }, []);
  const requestHunk = useCallback(
    (hunk: ParsedHunk, fileHeader: string[], operation: 'stage' | 'unstage' | 'discard') => {
      if (source === 'commit') return;
      if (operation !== 'discard') {
        void applyHunk(hunk, fileHeader, operation);
        return;
      }
      setConfirmDialog({
        variant: 'danger',
        title: tr('Änderungen in diesem Hunk verwerfen?', 'Discard changes in this hunk?'),
        message: tr(
          'Die ausgewählten ungestagten Zeilen werden aus der Arbeitsdatei entfernt.',
          'The selected unstaged lines will be removed from the working file.',
        ),
        contextItems: [
          { label: tr('Datei', 'File'), value: path },
          { label: 'Hunk', value: hunk.header },
        ],
        irreversible: true,
        consequences: t('generated.components.staging_area.usefileoperations.discarded_lines_cannot_be_restored_from_git_d40dd8f1'),
        confirmLabel: t('generated.components.staging_area.conflictresolverpanel.discard_changes_b80ac3bd'),
        onConfirm: async () => {
          if (scopeRef.current === currentScope) await applyHunk(hunk, fileHeader, 'discard');
        },
      });
    },
    [source, setConfirmDialog, tr, path, t, applyHunk, currentScope],
  );
  return (
    <div className="diff-viewer-root file-viewer-diff">
      <DiffToolbar
        request={request}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isMarkdownFile={false}
        isMarkdownPreviewMode={false}
        canRenderText={data.canRenderText}
        showBlame={blame.showBlame}
        setShowBlame={blame.setShowBlame}
        isBlameLoading={blame.isBlameLoading}
        hunkCount={data.hunkCount}
        activeHunkIndex={activeHunkIndex}
        scrollToHunk={scrollToHunk}
        onClose={() => {}}
        embedded
      />
      <DiffContentPane
        request={request}
        viewMode={viewMode}
        diffText={data.diffText}
        isLoading={data.isLoading}
        error={data.error}
        parsed={data.parsed}
        canRenderText={data.canRenderText}
        isBinaryDiff={data.isBinaryDiff}
        looksBinaryByExt={data.looksBinaryByExt}
        isTooLarge={data.isTooLarge}
        sourceTruncated={data.sourceTruncated}
        activeHunkIndex={activeHunkIndex}
        setHunkRef={setHunkRef}
        scrollToHunk={scrollToHunk}
        isHunkOperationRunning={isHunkOperationRunning}
        applyHunk={requestHunk}
        onRepoChanged={onRepoChanged}
        showBlame={blame.showBlame}
        isBlameLoading={blame.isBlameLoading}
        blameMap={blame.blameMap}
        onNavigateToCommit={onNavigateToCommit}
      />
    </div>
  );
}
