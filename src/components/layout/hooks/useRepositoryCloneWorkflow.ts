import { useCallback, useRef, useState } from 'react';
import type { CatalogTranslateFn } from '@/i18n';
import type { AppTabId } from '@/app/state/contracts';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import { hostingClient } from '@/services/hostingClient';
import { deriveRepoNameFromCloneSource } from '../workflows/repoWorkflowUtils';

type Params = {
  onRepoCloned: (repoPath: string) => Promise<boolean | void>;
  setActiveTab: (tab: AppTabId) => void;
  t: CatalogTranslateFn;
};

export const useRepositoryCloneWorkflow = ({ onRepoCloned, setActiveTab, t }: Params) => {
  const running = useRef(false);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  const [cloneRepoName, setCloneRepoName] = useState<string | null>(null);
  const [cloneFinished, setCloneFinished] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const cloneRepository = useCallback(
    async (cloneSource: string, options: { repoName?: string; targetName?: string; connectionId?: string } = {}) => {
      if (running.current || !gitClient.isAvailable() || !appClient.isAvailable()) return false;
      const targetDir = await appClient.selectProjectParentDirectory();
      if (!targetDir || running.current) return false;
      running.current = true;
      setIsCloning(true);
      setCloneLog([]);
      setCloneRepoName(options.repoName || deriveRepoNameFromCloneSource(cloneSource));
      setCloneFinished(false);
      setCloneError(null);
      const cleanup = gitClient.onCloneProgress((line) => setCloneLog((previous) => [...previous, line]));
      try {
        let path: string;
        if (options.connectionId) {
          const repository = await hostingClient.request('resolveRepository', { connectionId: options.connectionId, url: cloneSource });
          if (!repository) throw new Error('The repository URL does not belong to the selected hosting account or is unavailable.');
          const result = await hostingClient.request('clone', {
            repository: repository.ref,
            targetDir,
            targetName: options.targetName,
            useSsh: /^(?:ssh:\/\/|[^/@\s]+@[^:\s]+:)/i.test(cloneSource),
          });
          path = result.path;
        } else {
          const result = await gitClient.gitClone(cloneSource, targetDir, options.targetName);
          if (!result.success) throw new Error(result.error || t('generated.components.layout.hooks.usegithubdomain.unknown_error_2e5d0f05'));
          path = result.repoPath;
        }
        setCloneFinished(true);
        setCloneLog((previous) => [...previous, `SUCCESS: ${path}`]);
        const activated = await onRepoCloned(path);
        if (activated === false) return false;
        setActiveTab('repo');
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setCloneError(message);
        setCloneLog((previous) => [...previous, `ERROR: ${message}`]);
        return false;
      } finally {
        cleanup();
        running.current = false;
        setIsCloning(false);
      }
    },
    [onRepoCloned, setActiveTab, t],
  );

  const closeCloneProgress = useCallback(() => {
    if (running.current) return;
    setCloneFinished(false);
    setCloneError(null);
    setCloneLog([]);
    setCloneRepoName(null);
  }, []);

  return { isCloning, cloneLog, cloneRepoName, cloneFinished, cloneError, cloneRepository, closeCloneProgress };
};
