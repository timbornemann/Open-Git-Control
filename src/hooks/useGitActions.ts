import { useCallback, useRef, useState } from 'react';

type RunGitCommandOptions = {
  args: string[];
  successMsg: string;
  actionLabel?: string;
};

type Params = {
  activeRepo: string | null;
  onSuccess?: () => void;
  onError?: (msg: string) => void;
  onSuccessToast?: (msg: string) => void;
};

export const useGitActions = ({ activeRepo, onSuccess, onError, onSuccessToast }: Params) => {
  const [isGitActionRunning, setIsGitActionRunning] = useState(false);
  const [activeGitActionLabel, setActiveGitActionLabel] = useState<string | null>(null);
  const isGitActionRunningRef = useRef(false);

  const syncRunningRef = useCallback((value: boolean) => {
    isGitActionRunningRef.current = value;
    setIsGitActionRunning(value);
  }, []);

  const runGitCommand = useCallback(async ({ args, successMsg, actionLabel }: RunGitCommandOptions) => {
    if (!window.electronAPI || !activeRepo) return false;

    syncRunningRef(true);
    setActiveGitActionLabel(actionLabel || `Git ${args[0]} wird ausgefuehrt...`);

    try {
      const r = await window.electronAPI.runGitCommand(args[0], ...args.slice(1));
      if (r.success) {
        onSuccessToast?.(successMsg);
        onSuccess?.();
        return true;
      }
      onError?.(r.error || 'Fehler beim Ausführen von git.');
      return false;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Fehler beim Ausführen von git.';
      onError?.(message);
      return false;
    } finally {
      syncRunningRef(false);
      setActiveGitActionLabel(null);
    }
  }, [activeRepo, onError, onSuccess, onSuccessToast, syncRunningRef]);

  return {
    isGitActionRunning,
    isGitActionRunningRef,
    activeGitActionLabel,
    setActiveGitActionLabel,
    runGitCommand,
  };
};
