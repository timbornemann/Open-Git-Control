import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import type { DiffRequest } from '@/types/diff';
import { isMarkdownFilePath } from '@/utils/markdownPreview';
import type { DiffViewMode } from '@/utils/diffParser';
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
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<DiffViewMode>('unified');
  const [activeHunkIndex, setActiveHunkIndex] = useState(0);
  const hunkRefs = useRef<(HTMLDivElement | null)[]>([]);

  const isMarkdownFile = useMemo(() => isMarkdownFilePath(request.path), [request.path]);
  const isMarkdownPreviewMode = viewMode === 'preview' && isMarkdownFile;

  const diffData = useDiffPreviewData({ repoPath, request, t });
  const blame = useDiffBlame({ repoPath, request });
  const { hunkOpError, isHunkOperationRunning, applyHunk } = useHunkPatchActions({ repoPath, onRepoChanged, t });
  const { markdownPreview, handleMarkdownPreviewClick } = useMarkdownPreview({
    repoPath,
    request,
    isActive: isMarkdownPreviewMode,
    t,
  });

  useEffect(() => {
    setActiveHunkIndex(0);
    hunkRefs.current = [];
  }, [request]);

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
          hunkOpError={hunkOpError}
          isHunkOperationRunning={isHunkOperationRunning}
          applyHunk={applyHunk}
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
