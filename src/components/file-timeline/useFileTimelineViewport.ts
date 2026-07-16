import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCenteredTimelineViewport } from './fileTimelineLayout';
import type { FileTimelineDimensions, FileTimelineLayoutNode, FileTimelineViewport } from './types';

const initialViewport: FileTimelineViewport = {
  scale: 0.8,
  translateX: 0,
  translateY: 0,
};

const DEFAULT_MIN_SCALE = 0.15;
const MAX_SCALE = 3;

export const useFileTimelineViewport = (flatNodes: FileTimelineLayoutNode[], dimensions: FileTimelineDimensions, resetKey: string) => {
  const hasCenteredRef = useRef(false);
  const [viewport, setViewport] = useState<FileTimelineViewport>(initialViewport);
  const minScale = useMemo(() => {
    const fitViewport = getCenteredTimelineViewport(flatNodes, dimensions);
    return Math.min(DEFAULT_MIN_SCALE, fitViewport?.scale ?? DEFAULT_MIN_SCALE);
  }, [dimensions, flatNodes]);

  useEffect(() => {
    hasCenteredRef.current = false;
  }, [resetKey]);

  const centerView = useCallback(() => {
    const centeredViewport = getCenteredTimelineViewport(flatNodes, dimensions);
    if (centeredViewport) setViewport(centeredViewport);
  }, [dimensions, flatNodes]);

  useEffect(() => {
    if (flatNodes.length > 0 && dimensions.width > 0 && dimensions.height > 0 && !hasCenteredRef.current) {
      centerView();
      hasCenteredRef.current = true;
    }
  }, [centerView, dimensions.height, dimensions.width, flatNodes.length]);

  const zoomAt = useCallback(
    (screenX: number, screenY: number, requestedScale: number) => {
      const nextScale = Math.max(minScale, Math.min(requestedScale, MAX_SCALE));
      const worldX = (screenX - viewport.translateX) / viewport.scale;
      const worldY = (screenY - viewport.translateY) / viewport.scale;
      const nextViewport = {
        scale: nextScale,
        translateX: screenX - worldX * nextScale,
        translateY: screenY - worldY * nextScale,
      };

      setViewport(nextViewport);
      return nextViewport;
    },
    [minScale, viewport],
  );

  const zoomFromCenter = useCallback(
    (factor: number) => {
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      zoomAt(centerX, centerY, viewport.scale * factor);
    },
    [dimensions.height, dimensions.width, viewport.scale, zoomAt],
  );

  return {
    centerView,
    setViewport,
    viewport,
    zoomAt,
    zoomFromCenter,
  };
};
