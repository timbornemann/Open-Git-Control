import { useCallback, useRef, useState } from 'react';
import type { AppSettingsDto, SecretScanFindingDto } from '../global';

type RunGitCommandOptions = {
  args: string[];
  successMsg: string;
  actionLabel?: string;
  skipSecretScan?: boolean;
};

type Params = {
  activeRepo: string | null;
  settings?: Pick<AppSettingsDto, 'secretScanBeforePushEnabled'>;
  onSecretScanBlocked?: (findings: SecretScanFindingDto[], continuePush: () => Promise<void>) => void;
  onSuccess?: () => void;
  onError?: (msg: string) => void;
  onSuccessToast?: (msg: string) => void;
};

export const useGitActions = ({ activeRepo, settings, onSecretScanBlocked, onSuccess, onError, onSuccessToast }: Params) => {
  const [isGitActionRunning, setIsGitActionRunning] = useState(false);
  const [activeGitActionLabel, setActiveGitActionLabel] = useState<string | null>(null);
  const isGitActionRunningRef = useRef(false);

  const syncRunningRef = useCallback((value: boolean) => {
    isGitActionRunningRef.current = value;
    setIsGitActionRunning(value);
  }, []);

  const runGitCommand = useCallback(async ({ args, successMsg, actionLabel, skipSecretScan }: RunGitCommandOptions) => {
    if (!window.electronAPI || !activeRepo) return false;
    const command = args[0];

    const shouldScanPush = command === 'push' && settings?.secretScanBeforePushEnabled && !skipSecretScan;
    if (shouldScanPush) {
      const scanResult = await window.electronAPI.scanPushSecrets();
      if (!scanResult.success) {
        onError?.(scanResult.error || 'Secret-Scan vor Push fehlgeschlagen.');
        return false;
      }

      if (scanResult.data.findings.length > 0) {
        if (onSecretScanBlocked) {
          onSecretScanBlocked(scanResult.data.findings, async () => {
            await runGitCommand({ args, successMsg, actionLabel, skipSecretScan: true });
          });
        } else {
          onError?.('Moegliche Secrets erkannt. Push wurde blockiert.');
        }
        return false;
      }
    }

    syncRunningRef(true);
    setActiveGitActionLabel(actionLabel || `Git ${command} wird ausgefuehrt...`);

    try {
      const r = await window.electronAPI.runGitCommand(command, ...args.slice(1));
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
  }, [activeRepo, onError, onSecretScanBlocked, onSuccess, onSuccessToast, settings?.secretScanBeforePushEnabled, syncRunningRef]);

  return {
    isGitActionRunning,
    isGitActionRunningRef,
    activeGitActionLabel,
    setActiveGitActionLabel,
    runGitCommand,
  };
};
