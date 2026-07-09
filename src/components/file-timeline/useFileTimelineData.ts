import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildFileTimelineLayout, flattenTimelineLayout } from './fileTimelineLayout';
import type { FileTimelineDimensions, FileTimelineLayoutNode, FileTimelineNode } from './types';

export const useFileTimelineData = (fileTree: FileTimelineNode, dimensions: FileTimelineDimensions) => {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedPaths(new Set());
  }, [fileTree?.path]);

  const layoutTree = useMemo(() => buildFileTimelineLayout(fileTree, collapsedPaths, dimensions), [collapsedPaths, dimensions, fileTree]);
  const flatNodes = useMemo(() => flattenTimelineLayout(layoutTree), [layoutTree]);

  const toggleFolder = useCallback((node: FileTimelineLayoutNode) => {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  }, []);

  return {
    flatNodes,
    layoutTree,
    toggleFolder,
  };
};
