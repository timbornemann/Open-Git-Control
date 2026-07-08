import { useCallback } from 'react';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import type { AppTabId } from '@/components/layout/sidebar/AppSidebar.types';

type Toast = { msg: string; isError: boolean };

type Params = {
  setActiveTab: (tab: AppTabId) => void;
  setConflictResolverPath: (path: string) => void;
  setGitActionToast: (toast: Toast) => void;
  triggerRefresh: () => void;
  language: AppLanguage;
};

export const useConflictResolverWorkflow = ({ setActiveTab, setConflictResolverPath, setGitActionToast, triggerRefresh, language }: Params) => {
  const { t } = useLanguageTranslations(language);

  const openConflictResolverForPath = useCallback(
    (path: string) => {
      setActiveTab('repo');
      setConflictResolverPath(path);
      setGitActionToast({
        msg: t('generated.components.layout.workflows.useconflictresolverworkflow.merge_conflict_opening_the_conflict_resolver_2892ddfb'),
        isError: false,
      });
      triggerRefresh();
    },
    [setActiveTab, setConflictResolverPath, setGitActionToast, t, triggerRefresh],
  );

  return { openConflictResolverForPath };
};
