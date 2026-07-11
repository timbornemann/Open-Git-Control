import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gitClient } from '@/services/gitClient';
import type { SequencerOperation } from './sequencerState';

const REFRESH_INTERVAL_MS = 3000;

export const useSequencerOperation = (repoPath: string | null): SequencerOperation | null => {
  const [operation, setOperation] = useState<SequencerOperation | null>(null);
  const generationRef = useRef(0);
  const requestRef = useRef(0);

  useLayoutEffect(() => {
    generationRef.current += 1;
    requestRef.current += 1;
    setOperation(null);
  }, [repoPath]);

  const refresh = useCallback(async () => {
    if (!repoPath || !gitClient.isAvailable()) {
      setOperation(null);
      return;
    }
    const generation = generationRef.current;
    const request = ++requestRef.current;
    try {
      const result = await gitClient.getSequencerState(repoPath);
      if (generation !== generationRef.current || request !== requestRef.current) return;
      setOperation(result.success ? result.data.operation : null);
    } catch {
      if (generation === generationRef.current && request === requestRef.current) setOperation(null);
    }
  }, [repoPath]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return operation;
};
