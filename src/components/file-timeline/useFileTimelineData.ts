import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildFileTimelineLayout, flattenTimelineLayout } from './fileTimelineLayout';
import { FileTimelineSpatialIndex } from './fileTimelineSpatialIndex';
import { readTimelineSession, rememberTimelineSession } from './fileTimelineSession';
import type { FileTimelineDimensions, FileTimelineLayoutNode, FileTimelineNode } from './types';

export const useFileTimelineData = (fileTree: FileTimelineNode, dimensions: FileTimelineDimensions, contextKey = '') => {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => readTimelineSession(contextKey)?.collapsedPaths ?? new Set());

  useEffect(() => {
    setCollapsedPaths(readTimelineSession(contextKey)?.collapsedPaths ?? new Set());
  }, [contextKey, fileTree?.path]);
  useEffect(() => rememberTimelineSession(contextKey, { collapsedPaths }), [contextKey, collapsedPaths]);

  const layoutTree = useMemo(() => buildFileTimelineLayout(fileTree, collapsedPaths, dimensions), [collapsedPaths, dimensions, fileTree]);
  const flatNodes = useMemo(() => flattenTimelineLayout(layoutTree), [layoutTree]);
  const spatialIndex = useMemo(() => new FileTimelineSpatialIndex(flatNodes), [flatNodes]);

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
    spatialIndex,
    toggleFolder,
  };
};
