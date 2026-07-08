import { useCallback, useEffect, useRef, useState } from 'react';

export const PRIMARY_PANE_DEFAULT_RATIO = 0.7;
export const PRIMARY_PANE_MIN_WIDTH = 320;
export const INSPECTOR_PANE_MIN_WIDTH = 280;
const CONTENT_RESIZER_WIDTH = 8;
const MAIN_CONTENT_MIN_WIDTH = PRIMARY_PANE_MIN_WIDTH + INSPECTOR_PANE_MIN_WIDTH + CONTENT_RESIZER_WIDTH;
const CONTENT_PANE_RATIO_STORAGE_KEY = 'open-git-control.content-pane-ratio';
const INSPECTOR_PANE_WIDTH_STORAGE_KEY = 'open-git-control.inspector-pane-width';

const clampPrimaryPaneRatio = (ratio: number, containerWidth: number): number => {
  const effectiveWidth = Math.max(containerWidth, MAIN_CONTENT_MIN_WIDTH);
  const minRatio = PRIMARY_PANE_MIN_WIDTH / effectiveWidth;
  const maxRatio = (effectiveWidth - INSPECTOR_PANE_MIN_WIDTH - CONTENT_RESIZER_WIDTH) / effectiveWidth;
  const lower = Math.min(minRatio, maxRatio);
  const upper = Math.max(minRatio, maxRatio);
  return Math.min(upper, Math.max(lower, ratio));
};

export const useMainViewPaneResizer = () => {
  const [primaryPaneRatio, setPrimaryPaneRatio] = useState(() => {
    const storedRatioRaw = window.localStorage.getItem(CONTENT_PANE_RATIO_STORAGE_KEY);
    const storedRatio = Number(storedRatioRaw);
    return Number.isFinite(storedRatio) ? storedRatio : PRIMARY_PANE_DEFAULT_RATIO;
  });
  const [preferredInspectorWidth, setPreferredInspectorWidth] = useState<number | null>(() => {
    const storedWidthRaw = window.localStorage.getItem(INSPECTOR_PANE_WIDTH_STORAGE_KEY);
    const storedWidth = Number(storedWidthRaw);
    return Number.isFinite(storedWidth) && storedWidth > 0 ? Math.round(storedWidth) : null;
  });
  const [isContentResizing, setIsContentResizing] = useState(false);
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const contentResizeActiveRef = useRef(false);

  const primaryPaneBasis = `${(primaryPaneRatio * 100).toFixed(2)}%`;

  const handleContentResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    contentResizeActiveRef.current = true;
    setIsContentResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!contentResizeActiveRef.current || !contentAreaRef.current) return;
      const rect = contentAreaRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      const minPrimaryPx = PRIMARY_PANE_MIN_WIDTH;
      const maxPrimaryPx = Math.max(minPrimaryPx, rect.width - INSPECTOR_PANE_MIN_WIDTH - CONTENT_RESIZER_WIDTH);
      const rawPrimaryPx = event.clientX - rect.left;
      const clampedPrimaryPx = Math.min(maxPrimaryPx, Math.max(minPrimaryPx, rawPrimaryPx));
      const nextRatio = clampedPrimaryPx / rect.width;
      const nextInspectorWidth = Math.max(INSPECTOR_PANE_MIN_WIDTH, Math.round(rect.width - clampedPrimaryPx - CONTENT_RESIZER_WIDTH));

      setPrimaryPaneRatio(clampPrimaryPaneRatio(nextRatio, rect.width));
      setPreferredInspectorWidth(nextInspectorWidth);
    };

    const stopResize = () => {
      if (!contentResizeActiveRef.current) return;
      contentResizeActiveRef.current = false;
      setIsContentResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CONTENT_PANE_RATIO_STORAGE_KEY, String(primaryPaneRatio));
  }, [primaryPaneRatio]);

  useEffect(() => {
    if (!Number.isFinite(preferredInspectorWidth ?? NaN) || preferredInspectorWidth === null) return;
    window.localStorage.setItem(INSPECTOR_PANE_WIDTH_STORAGE_KEY, String(preferredInspectorWidth));
  }, [preferredInspectorWidth]);

  useEffect(() => {
    const clampToCurrentWidth = () => {
      if (!contentAreaRef.current) return;
      const rect = contentAreaRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      setPrimaryPaneRatio((previous) => {
        if (Number.isFinite(preferredInspectorWidth ?? NaN) && preferredInspectorWidth !== null) {
          const desiredPrimaryPx = rect.width - preferredInspectorWidth - CONTENT_RESIZER_WIDTH;
          const desiredRatio = desiredPrimaryPx / rect.width;
          return clampPrimaryPaneRatio(desiredRatio, rect.width);
        }
        return clampPrimaryPaneRatio(previous, rect.width);
      });
    };

    clampToCurrentWidth();
    window.addEventListener('resize', clampToCurrentWidth);
    return () => window.removeEventListener('resize', clampToCurrentWidth);
  }, [preferredInspectorWidth]);

  return {
    primaryPaneBasis,
    isContentResizing,
    contentAreaRef,
    handleContentResizeStart,
  };
};
