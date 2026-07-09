import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { BranchInfo, GitMergeMode } from '@/types/git';
import { mergeableDecoratedRefs, normalizeBranchRefForMerge } from '@/utils/gitParsing';
import type { GraphNode } from '@/utils/graphLayout';
import type { ContextMenuPlacement, ContextMenuState, MergeContextPayload } from './CommitContextMenu';

type UseCommitGraphContextMenuParams = {
  branches: BranchInfo[];
  currentBranch: string;
  onMergeBranch?: (branchName: string, mode: GitMergeMode) => void;
};

export const useCommitGraphContextMenu = ({ branches, currentBranch, onMergeBranch }: UseCommitGraphContextMenuParams) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuPlacement, setContextMenuPlacement] = useState<ContextMenuPlacement | null>(null);
  const [mergeCtxExpanded, setMergeCtxExpanded] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const updateContextMenuPlacement = useCallback(() => {
    if (!contextMenu || !contextMenuRef.current) return;

    const margin = 8;
    const menu = contextMenuRef.current;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxHeight = Math.max(160, viewportHeight - margin * 2);
    const menuWidth = menu.offsetWidth;
    const fullMenuHeight = Math.max(menu.scrollHeight, menu.offsetHeight);
    const visibleMenuHeight = Math.min(fullMenuHeight, maxHeight);

    const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
    const maxTop = Math.max(margin, viewportHeight - visibleMenuHeight - margin);
    const left = Math.min(Math.max(margin, contextMenu.x), maxLeft);
    const top = Math.min(Math.max(margin, contextMenu.y), maxTop);

    setContextMenuPlacement((current) => {
      if (current && current.left === left && current.top === top && current.maxHeight === maxHeight && current.ready) {
        return current;
      }
      return { left, top, maxHeight, ready: true };
    });
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu) {
      setContextMenuPlacement(null);
      return;
    }

    updateContextMenuPlacement();
    const frame = window.requestAnimationFrame(updateContextMenuPlacement);
    return () => window.cancelAnimationFrame(frame);
  }, [contextMenu, mergeCtxExpanded, updateContextMenuPlacement]);

  useEffect(() => {
    if (!contextMenu) return;
    window.addEventListener('resize', updateContextMenuPlacement);
    return () => window.removeEventListener('resize', updateContextMenuPlacement);
  }, [contextMenu, updateContextMenuPlacement]);

  const handleContextMenu = useCallback((event: MouseEvent, node: GraphNode) => {
    event.preventDefault();
    event.stopPropagation();
    setMergeCtxExpanded(false);
    setContextMenuPlacement({
      left: event.clientX,
      top: event.clientY,
      maxHeight: Math.max(160, window.innerHeight - 16),
      ready: false,
    });
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const mergeContextPayload = useMemo<MergeContextPayload | null>(() => {
    if (!contextMenu || !currentBranch || !onMergeBranch) return null;

    const node = contextMenu.node;
    const refsHere = mergeableDecoratedRefs(node.commit.refs, currentBranch);
    const seen = new Set<string>(refsHere);
    const branchExtras = branches
      .filter((branch) => !(branch.scope === 'local' && branch.name === currentBranch))
      .filter((branch) => !seen.has(normalizeBranchRefForMerge(branch.name)))
      .map((branch) => ({ raw: branch.name, label: normalizeBranchRefForMerge(branch.name), scope: branch.scope }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      hash: node.commit.hash,
      shortHash: node.commit.abbrevHash,
      refsHere,
      branchExtras,
    };
  }, [branches, contextMenu, currentBranch, onMergeBranch]);

  return {
    contextMenu,
    contextMenuRef,
    contextMenuPlacement,
    mergeCtxExpanded,
    mergeContextPayload,
    closeContextMenu: () => setContextMenu(null),
    handleContextMenu,
    toggleMergeContext: () => setMergeCtxExpanded((value) => !value),
  };
};
