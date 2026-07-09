import { useCallback, useState } from 'react';
import type { CatalogTranslateFn } from '@/i18n';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import { deriveRepoNameFromCloneSource } from './githubCloneHelpers';

type Params = {
  onRepoCloned: (repoPath: string) => Promise<void>;
  setActiveTab: (tab: 'localRepos' | 'repo' | 'github' | 'settings') => void;
  t: CatalogTranslateFn;
};

export const useGithubCloneWorkflow = ({ onRepoCloned, setActiveTab, t }: Params) => {
  const [isCloning, setIsCloning] = useState(false);
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  const [cloneRepoName, setCloneRepoName] = useState<string | null>(null);
  const [cloneFinished, setCloneFinished] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const cloneRepository = useCallback(
    async (
      cloneUrl: string,
      options: {
        repoName?: string;
        targetDir?: string | null;
        targetName?: string;
        switchToRepoTab?: boolean;
      } = {},
    ): Promise<boolean> => {
      if (!gitClient.isAvailable() || !appClient.isAvailable()) return false;
      const normalizedCloneUrl = String(cloneUrl || '').trim();
      if (!normalizedCloneUrl) {
        setCloneError(t('generated.components.layout.hooks.usegithubdomain.clone_url_is_required_f633ac79'));
        return false;
      }
      const targetDir = options.targetDir ?? (await appClient.selectDirectory());
      if (!targetDir) return false;

      setIsCloning(true);
      setCloneLog([]);
      setCloneRepoName(options.repoName || options.targetName || deriveRepoNameFromCloneSource(normalizedCloneUrl));
      setCloneFinished(false);
      setCloneError(null);

      const cleanup = gitClient.onCloneProgress((line: string) => {
        setCloneLog((prev) => [...prev, line]);
      });

      try {
        const result = await gitClient.gitClone(normalizedCloneUrl, targetDir, options.targetName);
        if (result.success) {
          setCloneFinished(true);
          setCloneLog((prev) => [
            ...prev,
            `SUCCESS: ${t('generated.components.layout.hooks.usegithubdomain.repository_cloned_successfully_to_667ce18e')}: ${result.repoPath}`,
          ]);
          await onRepoCloned(result.repoPath);
          if (options.switchToRepoTab !== false) {
            setActiveTab('repo');
          }
          return true;
        }

        const errorMessage = result.error || t('generated.components.layout.hooks.usegithubdomain.unknown_error_2e5d0f05');
        setCloneError(errorMessage);
        setCloneLog((prev) => [...prev, `ERROR: ${errorMessage}`]);
        return false;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : t('generated.components.layout.hooks.usegithubdomain.unknown_error_2e5d0f05');
        setCloneError(message);
        setCloneLog((prev) => [...prev, `ERROR: ${message}`]);
        return false;
      } finally {
        cleanup();
        setIsCloning(false);
      }
    },
    [onRepoCloned, setActiveTab, t],
  );

  const handleClone = useCallback(
    async (cloneUrl: string, repoName: string) => {
      await cloneRepository(cloneUrl, { repoName });
    },
    [cloneRepository],
  );

  const closeCloneProgress = useCallback(() => {
    setIsCloning(false);
    setCloneFinished(false);
    setCloneError(null);
    setCloneLog([]);
    setCloneRepoName(null);
  }, []);

  return {
    isCloning,
    setIsCloning,
    closeCloneProgress,
    cloneLog,
    cloneRepoName,
    cloneFinished,
    cloneError,
    cloneRepository,
    handleClone,
  };
};
