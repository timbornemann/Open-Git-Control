import { useLayoutEffect, useRef, useState } from 'react';
import { storageClient } from '@/services/storageClient';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { normalizeReleaseNotesInstructions } from '@/shared/releaseNotesInstructions';

export function useReleaseProjectInstructions(repoPath: string) {
  const available = storageClient.hasUiPreferences();
  const key = normalizeRepoPathKey(repoPath);
  const lifecycle = useRef({ generation: 0, saving: false }).current;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ value: '', loading: available && Boolean(repoPath), saving: false, error: '' });

  useLayoutEffect(() => {
    const request = ++lifecycle.generation;
    lifecycle.saving = false;
    setState({ value: '', loading: available && Boolean(repoPath), saving: false, error: '' });
    if (available && repoPath)
      void storageClient.uiPreferences().then(
        (result) => {
          if (lifecycle.generation !== request) return;
          if (!result.success) {
            setState((previous) => ({ ...previous, loading: false, error: result.error }));
            return;
          }
          const preferences = Object.entries(result.data).find(([path]) => normalizeRepoPathKey(path) === key)?.[1];
          setState({ value: preferences?.releaseNotesInstructions || '', loading: false, saving: false, error: '' });
        },
        (error: unknown) => {
          if (lifecycle.generation === request)
            setState((previous) => ({ ...previous, loading: false, error: String(error instanceof Error ? error.message : error) }));
        },
      );
    return () => {
      lifecycle.generation++;
    };
  }, [key, repoPath, available, retry, lifecycle]);

  const save = async (value: string): Promise<boolean> => {
    if (!available || !repoPath || state.loading || lifecycle.saving) return false;
    const request = lifecycle.generation;
    lifecycle.saving = true;
    setState((previous) => ({ ...previous, saving: true, error: '' }));
    try {
      const instructions = normalizeReleaseNotesInstructions(value);
      const result = await storageClient.updateUiPreferences({ repoPath, patch: { releaseNotesInstructions: instructions } });
      if (lifecycle.generation !== request) return false;
      if (!result.success) throw new Error(result.error);
      setState({ value: instructions, loading: false, saving: false, error: '' });
      return true;
    } catch (error) {
      if (lifecycle.generation === request)
        setState((previous) => ({ ...previous, saving: false, error: String(error instanceof Error ? error.message : error) }));
      return false;
    } finally {
      if (lifecycle.generation === request) lifecycle.saving = false;
    }
  };
  return { ...state, available, ready: !state.loading && !state.saving && !state.error, save, reload: () => setRetry((value) => value + 1) };
}
