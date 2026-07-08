import { useEffect, useState } from 'react';
import type { GitSubmoduleInfo } from '@/types/git';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { parseGitSubmoduleStatus } from '@/utils/gitParsing';
import { getElectronApi } from '@/services/electronApi';
import { gitClient } from '@/services/gitClient';
import type { GitActionToast } from './repositoryDomainTypes';

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  language: AppLanguage;
  setGitActionToast: (toast: GitActionToast) => void;
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string) => Promise<boolean>;
};

export const useRepositorySubmodules = ({ activeRepo, refreshTrigger, language, setGitActionToast, runGitCommand }: Params) => {
  const [submodules, setSubmodules] = useState<GitSubmoduleInfo[]>([]);
  const { t } = useLanguageTranslations(language);

  useEffect(() => {
    const fetchSubmodules = async () => {
      if (!activeRepo || !gitClient.isAvailable()) {
        setSubmodules([]);
        return;
      }

      try {
        const response = await gitClient.runGitCommand('submoduleStatus');
        if (!response.success) {
          setSubmodules([]);
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
      } catch {
        setSubmodules([]);
      }
    };

    fetchSubmodules();
  }, [activeRepo, refreshTrigger]);

  const handleSubmoduleInitUpdate = async () => {
    await runGitCommand(['submoduleUpdateInitRecursive'], t('generated.components.layout.hooks.userepositorydomain.submodules_initialized_updated_76af1313'));
  };

  const handleSubmoduleSync = async () => {
    await runGitCommand(['submoduleSyncRecursive'], t('generated.components.layout.hooks.userepositorydomain.submodule_urls_synchronized_7dfc04ea'));
  };

  const handleOpenSubmodule = async (submodulePath: string) => {
    const electronApi = getElectronApi();
    if (!electronApi) return;
    const result = await electronApi.openSubmodule(submodulePath);
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
