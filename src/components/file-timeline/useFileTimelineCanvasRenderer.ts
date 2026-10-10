import { useEffect, type RefObject } from 'react';
import { renderFileTimelineCanvas } from './fileTimelineRenderer';
import type { FileTimelineSpatialIndex } from './fileTimelineSpatialIndex';
import type { FileTimelineDimensions, FileTimelineLayoutNode, FileTimelineViewport } from './types';

type Params = {
  canvasRef: RefObject<HTMLCanvasElement>;
  dimensions: FileTimelineDimensions;
  flatNodes: FileTimelineLayoutNode[];
  viewport: FileTimelineViewport;
  spatialIndex: FileTimelineSpatialIndex;
};

export const useFileTimelineCanvasRenderer = ({ canvasRef, dimensions, flatNodes, viewport, spatialIndex }: Params) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderFileTimelineCanvas({
      ctx,
      dimensions,
      viewport,
      nodes: flatNodes,
      devicePixelRatio: window.devicePixelRatio || 1,
      spatialIndex,
    });
  }, [canvasRef, dimensions, flatNodes, viewport, spatialIndex]);
};
