import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [primaryPaneRatio, setPrimaryPaneRatio] = useState(PRIMARY_PANE_DEFAULT_RATIO);
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

      const rawRatio = (event.clientX - rect.left) / rect.width;
      setPrimaryPaneRatio(clampPrimaryPaneRatio(rawRatio, rect.width));
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
    const clampToCurrentWidth = () => {
      if (!contentAreaRef.current) return;
      const rect = contentAreaRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      setPrimaryPaneRatio((previous) => clampPrimaryPaneRatio(previous, rect.width));
    };

    clampToCurrentWidth();
    window.addEventListener('resize', clampToCurrentWidth);
    return () => window.removeEventListener('resize', clampToCurrentWidth);
  }, []);

  return {
    primaryPaneBasis,
    isContentResizing,
    contentAreaRef,
    handleContentResizeStart,
  };
};

