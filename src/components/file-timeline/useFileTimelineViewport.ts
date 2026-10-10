import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { getCenteredTimelineViewport } from './fileTimelineLayout';
import { readTimelineSession, rememberTimelineSession } from './fileTimelineSession';
import type { FileTimelineDimensions, FileTimelineLayoutNode, FileTimelineViewport } from './types';

const initialViewport: FileTimelineViewport = {
  scale: 0.8,
  translateX: 0,
  translateY: 0,
};

const DEFAULT_MIN_SCALE = 0.15;
const MAX_SCALE = 3;

export const useFileTimelineViewport = (flatNodes: FileTimelineLayoutNode[], dimensions: FileTimelineDimensions, resetKey: string) => {
  const hasCenteredRef = useRef(!!readTimelineSession(resetKey)?.camera);
  const [viewport, publishViewport] = useState<FileTimelineViewport>(() => readTimelineSession(resetKey)?.camera ?? initialViewport);
  const viewportRef = useRef(viewport);
  const frameRef = useRef<number | null>(null);
  const setViewport = useCallback((value: SetStateAction<FileTimelineViewport>) => {
    const next = typeof value === 'function' ? value(viewportRef.current) : value;
    viewportRef.current = next;
    // All input events use the latest camera, but React/canvas publish at most once per frame.
    if (typeof window.requestAnimationFrame !== 'function') {
      publishViewport(next);
      return;
    }
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      publishViewport(viewportRef.current);
    });
  }, []);
  useEffect(
    () => () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    },
    [],
  );
  const minScale = useMemo(() => {
    const fitViewport = getCenteredTimelineViewport(flatNodes, dimensions);
    return Math.min(DEFAULT_MIN_SCALE, fitViewport?.scale ?? DEFAULT_MIN_SCALE);
  }, [dimensions, flatNodes]);

  useEffect(() => {
    const camera = readTimelineSession(resetKey)?.camera;
    hasCenteredRef.current = !!camera;
    if (camera) {
      viewportRef.current = camera;
      publishViewport(camera);
    }
  }, [resetKey]);
  useEffect(() => rememberTimelineSession(resetKey, { camera: viewport }), [resetKey, viewport]);

  const centerView = useCallback(() => {
    const centeredViewport = getCenteredTimelineViewport(flatNodes, dimensions);
    if (centeredViewport) {
      viewportRef.current = centeredViewport;
      publishViewport(centeredViewport);
    }
  }, [dimensions, flatNodes]);

  useEffect(() => {
    if (flatNodes.length > 0 && dimensions.width > 0 && dimensions.height > 0 && !hasCenteredRef.current) {
      centerView();
      hasCenteredRef.current = true;
    }
  }, [centerView, dimensions.height, dimensions.width, flatNodes.length, resetKey]);

  const zoomAt = useCallback(
    (screenX: number, screenY: number, requestedScale: number) => {
      const nextScale = Math.max(minScale, Math.min(requestedScale, MAX_SCALE));
      const camera = viewportRef.current;
      const worldX = (screenX - camera.translateX) / camera.scale;
      const worldY = (screenY - camera.translateY) / camera.scale;
      const nextViewport = {
        scale: nextScale,
        translateX: screenX - worldX * nextScale,
        translateY: screenY - worldY * nextScale,
      };

      setViewport(nextViewport);
      return nextViewport;
    },
    [minScale, setViewport],
  );

  const zoomFromCenter = useCallback(
    (factor: number) => {
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      zoomAt(centerX, centerY, viewportRef.current.scale * factor);
    },
    [dimensions.height, dimensions.width, zoomAt],
  );

  return {
    centerView,
    setViewport,
    viewport,
    viewportRef,
    zoomAt,
    zoomFromCenter,
  };
};
