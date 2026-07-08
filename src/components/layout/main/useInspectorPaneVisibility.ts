import { useCallback, useEffect, useRef, useState } from 'react';

const INSPECTOR_MANUAL_COLLAPSED_STORAGE_KEY = 'open-git-control.inspector-manually-collapsed';

export const useInspectorPaneVisibility = () => {
  const inspectorManuallyCollapsedRef = useRef(
    window.localStorage.getItem(INSPECTOR_MANUAL_COLLAPSED_STORAGE_KEY) === 'true',
  );
  const [isInspectorPaneVisible, setIsInspectorPaneVisible] = useState(() => {
    return window.innerWidth > 900 && !inspectorManuallyCollapsedRef.current;
  });

  const toggleInspectorPane = useCallback(() => {
    setIsInspectorPaneVisible((previous) => {
      const next = !previous;
      inspectorManuallyCollapsedRef.current = !next;
      window.localStorage.setItem(INSPECTOR_MANUAL_COLLAPSED_STORAGE_KEY, String(!next));
      return next;
    });
  }, []);

  const hideInspectorPane = useCallback(() => {
    inspectorManuallyCollapsedRef.current = true;
    window.localStorage.setItem(INSPECTOR_MANUAL_COLLAPSED_STORAGE_KEY, 'true');
    setIsInspectorPaneVisible(false);
  }, []);

  useEffect(() => {
    const compactViewport = window.matchMedia('(max-width: 900px)');
    const syncInspectorWithViewport = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsInspectorPaneVisible(!event.matches && !inspectorManuallyCollapsedRef.current);
    };

    syncInspectorWithViewport(compactViewport);
    compactViewport.addEventListener('change', syncInspectorWithViewport);
    return () => compactViewport.removeEventListener('change', syncInspectorWithViewport);
  }, []);

  return {
    isInspectorPaneVisible,
    toggleInspectorPane,
    hideInspectorPane,
  };
};
