import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  APPLICATION_LAYOUT_RESET_EVENT,
  resetStoredLayoutPreferences,
  SIDEBAR_MANUAL_COLLAPSED_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from '@/utils/layoutPreferences';

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_DEFAULT_WIDTH = 260;
const APP_RESIZER_WIDTH = 8;
const MIN_MAIN_VIEW_WIDTH = 608;
const COMPACT_LAYOUT_MAX_WIDTH = 900;

const getSidebarMaxWidthForViewport = (viewportWidth: number): number => {
  if (viewportWidth <= COMPACT_LAYOUT_MAX_WIDTH) {
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, viewportWidth - 44));
  }
  const maxFromWindow = Math.max(SIDEBAR_MIN_WIDTH, viewportWidth - MIN_MAIN_VIEW_WIDTH - APP_RESIZER_WIDTH);
  return Math.min(SIDEBAR_MAX_WIDTH, maxFromWindow);
};

const clampSidebarWidthForViewport = (width: number, viewportWidth: number): number =>
  Math.max(SIDEBAR_MIN_WIDTH, Math.min(getSidebarMaxWidthForViewport(viewportWidth), width));

const readInitialSidebarWidth = (): number => {
  const storedWidthRaw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  const storedWidthValue = storedWidthRaw === null ? Number.NaN : Number(storedWidthRaw);
  const width = Number.isFinite(storedWidthValue) && storedWidthValue > 0 ? Math.round(storedWidthValue) : SIDEBAR_DEFAULT_WIDTH;
  return clampSidebarWidthForViewport(width, window.innerWidth);
};

export const useResizableSidebar = () => {
  const [sidebarWidth, setSidebarWidth] = useState(readInitialSidebarWidth);
  const sidebarManuallyCollapsedRef = useRef(window.localStorage.getItem(SIDEBAR_MANUAL_COLLAPSED_STORAGE_KEY) === 'true');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return window.innerWidth <= COMPACT_LAYOUT_MAX_WIDTH || sidebarManuallyCollapsedRef.current;
  });
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const sidebarResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pendingSidebarWidthRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);

  const getSidebarMaxWidth = useCallback(() => {
    return getSidebarMaxWidthForViewport(window.innerWidth);
  }, []);

  const clampSidebarWidth = useCallback(
    (width: number) => {
      return Math.max(SIDEBAR_MIN_WIDTH, Math.min(getSidebarMaxWidth(), width));
    },
    [getSidebarMaxWidth],
  );

  const resetLayout = useCallback(() => {
    resetStoredLayoutPreferences();
  }, []);

  useEffect(() => {
    const handleLayoutReset = () => {
      sidebarManuallyCollapsedRef.current = false;
      setSidebarWidth(clampSidebarWidth(SIDEBAR_DEFAULT_WIDTH));
      setIsSidebarCollapsed(window.innerWidth <= COMPACT_LAYOUT_MAX_WIDTH);
    };

    window.addEventListener(APPLICATION_LAYOUT_RESET_EVENT, handleLayoutReset);
    return () => window.removeEventListener(APPLICATION_LAYOUT_RESET_EVENT, handleLayoutReset);
  }, [clampSidebarWidth]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;
      sidebarManuallyCollapsedRef.current = next;
      window.localStorage.setItem(SIDEBAR_MANUAL_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const handleSidebarResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      sidebarResizeStateRef.current = { startX: event.clientX, startWidth: sidebarWidth };
      setIsSidebarResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sidebarWidth],
  );

  useEffect(() => {
    const applyPendingSidebarWidth = () => {
      resizeFrameRef.current = null;
      const nextWidth = pendingSidebarWidthRef.current;
      pendingSidebarWidthRef.current = null;
      if (nextWidth === null) return;
      setSidebarWidth((previous) => (previous === nextWidth ? previous : nextWidth));
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = sidebarResizeStateRef.current;
      if (!dragState) return;

      const delta = event.clientX - dragState.startX;
      const nextWidth = Math.round(dragState.startWidth + delta);
      const clampedWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(getSidebarMaxWidth(), nextWidth));
      pendingSidebarWidthRef.current = clampedWidth;
      if (resizeFrameRef.current !== null) return;

      // Pointer events can arrive faster than the screen can paint. Limiting
      // updates to animation frames keeps the resize responsive without
      // repeatedly rerendering the app and its graph between frames.
      if (typeof window.requestAnimationFrame === 'function') {
        resizeFrameRef.current = window.requestAnimationFrame(applyPendingSidebarWidth);
      } else {
        applyPendingSidebarWidth();
      }
    };

    const stopResize = () => {
      if (!sidebarResizeStateRef.current) return;
      sidebarResizeStateRef.current = null;
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      applyPendingSidebarWidth();
      setIsSidebarResizing(false);
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
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      pendingSidebarWidthRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [getSidebarMaxWidth]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const compactViewport = window.matchMedia(`(max-width: ${COMPACT_LAYOUT_MAX_WIDTH}px)`);
    const syncSidebarWithViewport = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsSidebarCollapsed(event.matches || sidebarManuallyCollapsedRef.current);
    };

    syncSidebarWithViewport(compactViewport);
    compactViewport.addEventListener('change', syncSidebarWithViewport);
    return () => compactViewport.removeEventListener('change', syncSidebarWithViewport);
  }, []);

  useEffect(() => {
    const clampToViewport = () => {
      const maxWidth = getSidebarMaxWidth();
      setSidebarWidth((previous) => Math.max(SIDEBAR_MIN_WIDTH, Math.min(previous, maxWidth)));
    };

    clampToViewport();
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, [getSidebarMaxWidth]);

  return {
    sidebarWidth,
    isSidebarCollapsed,
    isSidebarResizing,
    resetLayout,
    handleToggleSidebar,
    handleSidebarResizeStart,
  };
};
