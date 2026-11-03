import { useEffect, useLayoutEffect, useRef } from 'react';

export const TUTORIAL_AUTO_ADVANCE_MS = 900;

/** Allow the success feedback to be read before entering the next checkpoint. */
export function useTutorialAutoAdvance(stepId: string, complete: boolean, enabled: boolean, onAdvance: () => void) {
  const advance = useRef(onAdvance);
  const advanced = useRef(false);
  useLayoutEffect(() => {
    advance.current = onAdvance;
  }, [onAdvance]);
  useEffect(() => {
    advanced.current = false;
  }, [stepId]);
  useEffect(() => {
    if (!complete || !enabled || advanced.current) return;
    const timer = setTimeout(() => {
      advanced.current = true;
      advance.current();
    }, TUTORIAL_AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [stepId, complete, enabled]);
}
