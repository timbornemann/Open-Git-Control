import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GitSubmoduleInfo } from '@/types/git';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { parseGitSubmoduleStatus } from '@/utils/gitParsing';
import { getElectronApi } from '@/services/electronApi';
import { gitClient } from '@/services/gitClient';
import type { GitActionToast } from './repositoryDomainTypes';
import type { RunGitCommandOptions } from '@/app/state/contracts';

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  language: AppLanguage;
  setGitActionToast: (toast: GitActionToast) => void;
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string, options?: RunGitCommandOptions) => Promise<boolean>;
};

export const useRepositorySubmodules = ({ activeRepo, refreshTrigger, language, setGitActionToast, runGitCommand }: Params) => {
  const [submodules, setSubmodules] = useState<GitSubmoduleInfo[]>([]);
  const activeRepoRef = useRef(activeRepo);
  activeRepoRef.current = activeRepo;
  const { t } = useLanguageTranslations(language);

  useLayoutEffect(() => {
    setSubmodules([]);
  }, [activeRepo]);

  useEffect(() => {
    let cancelled = false;
    const fetchSubmodules = async () => {
      if (!activeRepo || !gitClient.isAvailable()) {
        setSubmodules([]);
        return;
      }

      try {
        const response = await gitClient.runGitCommandForRepo(activeRepo, 'submoduleStatus');
        if (cancelled) return;
        if (!response.success) {
          setSubmodules([]);
          setGitActionToast({
            msg: response.error || t('generated.components.layout.hooks.userepositorydomain.could_not_load_submodules_a1b2c3d4'),
            isError: true,
          });
          return;
        }

        const parsed = parseGitSubmoduleStatus(String(response.data || '')).map((item) => ({
          path: item.path,
          commit: item.commit,
          stateCode: item.stateCode,
          isDirty: item.isDirty,
          summary: item.summary,
        }));
        setSubmodules(parsed);
      } catch (error: unknown) {
        if (cancelled) return;
        setSubmodules([]);
        setGitActionToast({
          msg: error instanceof Error ? error.message : t('generated.components.layout.hooks.userepositorydomain.could_not_load_submodules_a1b2c3d4'),
          isError: true,
        });
      }
    };

    fetchSubmodules();
    return () => {
      cancelled = true;
    };
  }, [activeRepo, refreshTrigger, setGitActionToast, t]);

  const handleSubmoduleInitUpdate = async () => {
    if (!activeRepo) return;
    await runGitCommand(
      gitClient.buildSubmoduleUpdateInitRecursiveArgs(),
      t('generated.components.layout.hooks.userepositorydomain.submodules_initialized_updated_76af1313'),
      undefined,
      { expectedRepoPath: activeRepo },
    );
  };

  const handleSubmoduleSync = async () => {
    if (!activeRepo) return;
    await runGitCommand(
      gitClient.buildSubmoduleSyncRecursiveArgs(),
      t('generated.components.layout.hooks.userepositorydomain.submodule_urls_synchronized_7dfc04ea'),
      undefined,
      { expectedRepoPath: activeRepo },
    );
  };

  const handleOpenSubmodule = async (submodulePath: string) => {
    const electronApi = getElectronApi();
    const repoAtStart = activeRepo;
    if (!electronApi || !repoAtStart) return;
    const result = await electronApi.openSubmodule(submodulePath, repoAtStart);
    if (activeRepoRef.current !== repoAtStart) return;
    if (!result.success) {
      setGitActionToast({
        msg: result.error || t('generated.components.layout.hooks.userepositorydomain.could_not_open_submodule_39e4c0fb'),
        isError: true,
      });
    }
  };

  return {
    submodules,
    handleSubmoduleInitUpdate,
    handleSubmoduleSync,
    handleOpenSubmodule,
  };
};
