import { useCallback, useEffect, useRef, useState } from 'react';
import { APPLICATION_LAYOUT_RESET_EVENT, CONTENT_PANE_RATIO_STORAGE_KEY, INSPECTOR_PANE_WIDTH_STORAGE_KEY } from '@/utils/layoutPreferences';

export const PRIMARY_PANE_DEFAULT_RATIO = 0.7;
export const PRIMARY_PANE_MIN_WIDTH = 320;
export const INSPECTOR_PANE_MIN_WIDTH = 280;
const CONTENT_RESIZER_WIDTH = 8;
const MAIN_CONTENT_MIN_WIDTH = PRIMARY_PANE_MIN_WIDTH + INSPECTOR_PANE_MIN_WIDTH + CONTENT_RESIZER_WIDTH;

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
    const storedRatio = storedRatioRaw === null ? Number.NaN : Number(storedRatioRaw);
    return Number.isFinite(storedRatio) && storedRatio > 0 && storedRatio < 1 ? storedRatio : PRIMARY_PANE_DEFAULT_RATIO;
  });
  const [preferredInspectorWidth, setPreferredInspectorWidth] = useState<number | null>(() => {
    const storedWidthRaw = window.localStorage.getItem(INSPECTOR_PANE_WIDTH_STORAGE_KEY);
    const storedWidth = storedWidthRaw === null ? Number.NaN : Number(storedWidthRaw);
    return Number.isFinite(storedWidth) && storedWidth > 0 ? Math.round(storedWidth) : null;
  });
  const [isContentResizing, setIsContentResizing] = useState(false);
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const contentResizeActiveRef = useRef(false);
  const contentResizeRectRef = useRef<{ left: number; width: number } | null>(null);
  const preferredInspectorWidthRef = useRef<number | null>(preferredInspectorWidth);

  const primaryPaneBasis = `${(primaryPaneRatio * 100).toFixed(2)}%`;

  const handleContentResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = contentAreaRef.current?.getBoundingClientRect();
    contentResizeRectRef.current = rect && rect.width > 0 ? { left: rect.left, width: rect.width } : null;
    contentResizeActiveRef.current = true;
    setIsContentResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleLayoutReset = () => {
      contentResizeActiveRef.current = false;
      preferredInspectorWidthRef.current = null;
      setIsContentResizing(false);
      setPrimaryPaneRatio(PRIMARY_PANE_DEFAULT_RATIO);
      setPreferredInspectorWidth(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener(APPLICATION_LAYOUT_RESET_EVENT, handleLayoutReset);
    return () => window.removeEventListener(APPLICATION_LAYOUT_RESET_EVENT, handleLayoutReset);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!contentResizeActiveRef.current) return;
      const rect = contentResizeRectRef.current;
      if (!rect) return;
      if (rect.width <= 0) return;

      const minPrimaryPx = PRIMARY_PANE_MIN_WIDTH;
      const maxPrimaryPx = Math.max(minPrimaryPx, rect.width - INSPECTOR_PANE_MIN_WIDTH - CONTENT_RESIZER_WIDTH);
      const rawPrimaryPx = event.clientX - rect.left;
      const clampedPrimaryPx = Math.min(maxPrimaryPx, Math.max(minPrimaryPx, rawPrimaryPx));
      const nextRatio = clampedPrimaryPx / rect.width;
      const nextInspectorWidth = Math.max(INSPECTOR_PANE_MIN_WIDTH, Math.round(rect.width - clampedPrimaryPx - CONTENT_RESIZER_WIDTH));

      preferredInspectorWidthRef.current = nextInspectorWidth;
      const clampedRatio = clampPrimaryPaneRatio(nextRatio, rect.width);
      setPrimaryPaneRatio((previous) => (Math.abs(previous - clampedRatio) < 0.000_001 ? previous : clampedRatio));
    };

    const stopResize = () => {
      if (!contentResizeActiveRef.current) return;
      contentResizeActiveRef.current = false;
      contentResizeRectRef.current = null;
      const nextPreferredInspectorWidth = preferredInspectorWidthRef.current;
      if (nextPreferredInspectorWidth !== null) {
        setPreferredInspectorWidth((previous) => (previous === nextPreferredInspectorWidth ? previous : nextPreferredInspectorWidth));
      }
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
    const clampToCurrentWidth = (containerWidth: number) => {
      if (containerWidth <= 0) return;
      setPrimaryPaneRatio((previous) => {
        if (Number.isFinite(preferredInspectorWidth ?? NaN) && preferredInspectorWidth !== null) {
          const desiredPrimaryPx = containerWidth - preferredInspectorWidth - CONTENT_RESIZER_WIDTH;
          const desiredRatio = desiredPrimaryPx / containerWidth;
          const clamped = clampPrimaryPaneRatio(desiredRatio, containerWidth);
          return Math.abs(previous - clamped) < 0.000_001 ? previous : clamped;
        }
        const clamped = clampPrimaryPaneRatio(previous, containerWidth);
        return Math.abs(previous - clamped) < 0.000_001 ? previous : clamped;
      });
    };

    const contentArea = contentAreaRef.current;
    if (!contentArea) return;
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const entry = entries.find((candidate) => candidate.target === contentArea);
        if (entry) clampToCurrentWidth(entry.contentRect.width);
      });
      observer.observe(contentArea);
      return () => observer.disconnect();
    }

    if (typeof window.requestAnimationFrame === 'function') {
      const frameId = window.requestAnimationFrame(() => clampToCurrentWidth(contentArea.getBoundingClientRect().width));
      return () => window.cancelAnimationFrame(frameId);
    }
    const timeoutId = window.setTimeout(() => clampToCurrentWidth(contentArea.getBoundingClientRect().width), 0);
    return () => window.clearTimeout(timeoutId);
  }, [preferredInspectorWidth]);

  return {
    primaryPaneBasis,
    isContentResizing,
    contentAreaRef,
    handleContentResizeStart,
  };
};
