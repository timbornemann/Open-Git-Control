import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { useRepositoryContext, useUIContext } from '@/contexts/AppStateContext';
import type { DiffRequest } from '@/types/diff';
import { isMarkdownFilePath } from '@/utils/markdownPreview';
import type { DiffViewMode, ParsedHunk } from '@/utils/diffParser';
import { DiffContentPane } from './DiffContentPane';
import { DiffToolbar } from './DiffToolbar';
import { MarkdownPreviewPane } from './MarkdownPreviewPane';
import { useDiffBlame } from './useDiffBlame';
import { useDiffPreviewData } from './useDiffPreviewData';
import { useHunkPatchActions } from './useHunkPatchActions';
import { useMarkdownPreview } from './useMarkdownPreview';
import '@/styles/diff-viewer.css';

interface DiffViewerProps {
  repoPath: string | null;
  request: DiffRequest;
  onClose: () => void;
  onRepoChanged?: () => void;
  onNavigateToCommit?: (hash: string) => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ repoPath, request, onClose, onRepoChanged, onNavigateToCommit }) => {
  const { t, tr } = useI18n();
  const { setConfirmDialog } = useUIContext();
  const { onToast } = useRepositoryContext();
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
  const [activeHunkIndex, setActiveHunkIndex] = useState(0);
  const [diffRefreshTrigger, setDiffRefreshTrigger] = useState(0);
  const hunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const requestScope = `${repoPath || ''}\0${request.source}\0${request.commitHash || ''}\0${request.path}`;
  const requestScopeRef = useRef<string | null>(requestScope);
  requestScopeRef.current = requestScope;

  const isMarkdownFile = useMemo(() => isMarkdownFilePath(request.path), [request.path]);
  const isMarkdownPreviewMode = viewMode === 'preview' && isMarkdownFile;

  const diffData = useDiffPreviewData({ repoPath, request, refreshTrigger: diffRefreshTrigger, t });
  const blame = useDiffBlame({ repoPath, request, refreshTrigger: diffRefreshTrigger });
  const reportHunkError = useCallback((message: string) => onToast(message, true), [onToast]);
  const { isHunkOperationRunning, applyHunk } = useHunkPatchActions({
    repoPath,
    request,
    onRepoChanged,
    onApplied: () => setDiffRefreshTrigger((value) => value + 1),
    onError: reportHunkError,
    t,
  });
  const { markdownPreview, handleMarkdownPreviewClick } = useMarkdownPreview({
    repoPath,
    request,
    isActive: isMarkdownPreviewMode,
    t,
  });

  useEffect(() => {
    setActiveHunkIndex(0);
    hunkRefs.current = [];
  }, [diffRefreshTrigger, request]);

  useEffect(
    () => () => {
      requestScopeRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!isMarkdownFile && viewMode === 'preview') {
      setViewMode('unified');
    }
  }, [isMarkdownFile, viewMode]);

  const scrollToHunk = useCallback(
    (index: number) => {
      if (diffData.hunkCount === 0) return;
      const next = Math.max(0, Math.min(index, diffData.hunkCount - 1));
      setActiveHunkIndex(next);
      hunkRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [diffData.hunkCount],
  );

  const setHunkRef = useCallback((index: number, element: HTMLDivElement | null) => {
    hunkRefs.current[index] = element;
  }, []);

  const requestHunkOperation = useCallback(
    (hunk: ParsedHunk, fileHeader: string[], operation: 'stage' | 'unstage' | 'discard') => {
      if (operation !== 'discard') {
        void applyHunk(hunk, fileHeader, operation);
        return;
      }

      const scopeAtRequest = requestScope;
      setConfirmDialog({
        variant: 'danger',
        title: tr('Aenderungen in diesem Hunk verwerfen?', 'Discard changes in this hunk?'),
        message: tr(
          'Die ausgewaehlten, nicht gestagten Zeilen werden dauerhaft aus dem Working Tree entfernt.',
          'The selected unstaged lines will be permanently removed from the working tree.',
        ),
        contextItems: [
          { label: t('generated.components.commitdetails.file_9d811416'), value: request.path },
          { label: 'Hunk', value: hunk.header },
        ],
        irreversible: true,
        consequences: t('generated.components.staging_area.usefileoperations.discarded_lines_cannot_be_restored_from_git_d40dd8f1'),
        confirmLabel: t('generated.components.staging_area.conflictresolverpanel.discard_changes_b80ac3bd'),
        onConfirm: async () => {
          if (requestScopeRef.current !== scopeAtRequest) return;
          await applyHunk(hunk, fileHeader, 'discard');
        },
      });
    },
    [applyHunk, request.path, requestScope, setConfirmDialog, t, tr],
  );

  return (
    <div className="diff-viewer-root">
      <DiffToolbar
        request={request}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isMarkdownFile={isMarkdownFile}
        isMarkdownPreviewMode={isMarkdownPreviewMode}
        canRenderText={diffData.canRenderText}
        showBlame={blame.showBlame}
        setShowBlame={blame.setShowBlame}
        isBlameLoading={blame.isBlameLoading}
        hunkCount={diffData.hunkCount}
        activeHunkIndex={activeHunkIndex}
        scrollToHunk={scrollToHunk}
        onClose={onClose}
      />

      {isMarkdownPreviewMode ? (
        <MarkdownPreviewPane markdownPreview={markdownPreview} onPreviewClick={handleMarkdownPreviewClick} />
      ) : (
        <DiffContentPane
          request={request}
          viewMode={viewMode}
          diffText={diffData.diffText}
          isLoading={diffData.isLoading}
          error={diffData.error}
          parsed={diffData.parsed}
          canRenderText={diffData.canRenderText}
          isBinaryDiff={diffData.isBinaryDiff}
          looksBinaryByExt={diffData.looksBinaryByExt}
          isTooLarge={diffData.isTooLarge}
          sourceTruncated={diffData.sourceTruncated}
          activeHunkIndex={activeHunkIndex}
          setHunkRef={setHunkRef}
          scrollToHunk={scrollToHunk}
          isHunkOperationRunning={isHunkOperationRunning}
          applyHunk={requestHunkOperation}
          onRepoChanged={onRepoChanged}
          showBlame={blame.showBlame}
          isBlameLoading={blame.isBlameLoading}
          blameMap={blame.blameMap}
          onNavigateToCommit={onNavigateToCommit}
        />
      )}
    </div>
  );
};
