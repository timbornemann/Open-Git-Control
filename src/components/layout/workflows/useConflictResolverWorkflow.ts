import { useCallback } from 'react';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import type { AppTabId } from '../sidebar/AppSidebar.types';

type Toast = { msg: string; isError: boolean };

type Params = {
  setActiveTab: (tab: AppTabId) => void;
  setConflictResolverPath: (path: string) => void;
  setGitActionToast: (toast: Toast) => void;
  triggerRefresh: () => void;
  language: AppLanguage;
};

export const useConflictResolverWorkflow = ({
  setActiveTab,
  setConflictResolverPath,
  setGitActionToast,
  triggerRefresh,
  language,
}: Params) => {
  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(language, deText, enText);
  }, [language]);

  const openConflictResolverForPath = useCallback((path: string) => {
    setActiveTab('repo');
    setConflictResolverPath(path);
    setGitActionToast({
      msg: tr(
        'Merge-Konflikt: Konflikt-Resolver wird geoeffnet.',
        'Merge conflict: opening the conflict resolver.',
      ),
      isError: false,
    });
    triggerRefresh();
  }, [setActiveTab, setConflictResolverPath, setGitActionToast, triggerRefresh, tr]);

  return { openConflictResolverForPath };
};
